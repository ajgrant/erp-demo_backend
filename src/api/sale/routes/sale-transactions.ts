export default {
  routes: [
    {
      method: "POST",
      path: "/sale-transactions",
      handler: "sale-transactions.createSaleTransaction",
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
