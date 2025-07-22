"use strict";

// A Controller for handling sale transactions with atomicity

// Helper function to generate a unique document ID for sales
function generateSaleDocumentId() {
  // Example: "sale_" + current timestamp + random 4-digit number
  return `sale_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
}

export default {
  async createSaleTransaction(ctx) {
    try {
      const { data } = ctx.request.body;

      console.log("Received data:", JSON.stringify(data, null, 2));

      // Validate required data
      if (!data || !data.products || !Array.isArray(data.products)) {
        return ctx.badRequest("Invalid request data");
      }

      // Use Strapi's transaction API for stock updates only
      const result = await strapi.db.transaction(async ({ trx }) => {
        // Validate stock first using entityService (outside transaction for simplicity)
        for (const productItem of data.products) {
          const product = await strapi
            .documents("api::product.product")
            .findOne({
              documentId: productItem.productId,
            });

          if (!product) {
            throw new Error(
              `Product with ID ${productItem.productId} not found`
            );
          }

          if (product.stock < productItem.quantity) {
            throw new Error(
              `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${productItem.quantity}`
            );
          }
        }

        // Create the sale WITHOUT the products relation using raw Knex
        const sale = await trx("sales")
          .insert({
            customer_name: data.customer_name,
            invoice_number: data.invoice_number,
            customer_email: data.customer_email,
            customer_phone: data.customer_phone,
            date: data.date,
            notes: data.notes,
            subtotal: data.subtotal,
            tax_amount: data.tax_amount,
            discount_amount: data.discount_amount,
            total: data.total,
            // Generate a unique document ID
            document_id: generateSaleDocumentId(),
            created_at: new Date(),
            updated_at: new Date(),
            published_at: new Date(),
          })
          .returning("*");

        console.log("Sale created:", sale);

        // Update stock for each product within the transaction
        for (const productItem of data.products) {
          const product = await trx("products")
            .where({ document_id: productItem.productId })
            .first();
          await trx("products")
            .where({ document_id: productItem.productId })
            .update({
              stock: product.stock - productItem.quantity,
            });
        }

        return sale[0];
      });
      console.log("Transaction result:", result);
      // After the transaction, handle the products relation using Strapi's entity service
      const updatedSale = await strapi.documents("api::sale.sale").update({
        documentId: result.document_id,
        data: {
          products: data.products.map((item) => ({
            product: item.productId,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      });

      console.log("Transaction completed successfully");

      // Return success response
      return ctx.send({
        data: updatedSale,
        meta: { success: true },
      });
    } catch (error) {
      console.error("Sale transaction error:", error);
      return ctx.throw(500, error.message || "Internal Server Error");
    }
  },
};
