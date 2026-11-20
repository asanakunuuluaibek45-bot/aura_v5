// Explicit public server-action contract. Never resolve a client-provided import path.
// The packaged UI uses exactly the same actions as the PWA, over HTTPS instead
// of Next's deployment-specific server-action protocol.
export const NATIVE_ACTIONS = Object.freeze({
  "action-history": ["getActionHistory", "getActionHistoryPage", "undoAction"],
  article: ["generateArticle", "createProduct"],
  cabinet: ["getCabinetData", "setDefaultReceiptType", "approveRequest", "rejectRequest", "removeMember", "setMemberBonusRate", "setDefaultBonusRate", "touchPresence", "resetBonusPoints", "setBonusPoints"],
  cash: ["getCashData", "createCashOperation", "deleteCashReasonPreset"],
  clients: ["getClients", "getClientPurchases", "getCustomerDebtData", "payCustomerDebt", "extendCustomerCreditDueDate", "setClientBlacklist", "createClient_", "updateClient", "deleteClient"],
  labels: ["saveLabelTemplate", "getLabelTemplate", "deleteLabelTemplate"],
  notifications: ["getNotifications", "getUnreadCount", "markNotificationRead", "markAllNotificationsRead", "approveFromNotification", "rejectFromNotification"],
  products: ["getShopSeqIdForLabel", "getProducts", "getProductsPage", "findProductBySku", "createProduct", "updateProduct", "deleteProduct", "generateArticle"],
  "product-units": ["getProductUnitUsageCount"],
  qr: ["checkQrShop"],
  rates: ["getMetalRates", "upsertMetalRate"],
  returns: ["getSaleReturns", "getSaleReturnsInRange", "returnSaleItem"],
  sales: ["getSales", "getSalesPage", "getDailySalesSummary", "getSalesInRange", "checkout"],
  shops: ["getPublicShops", "getOwnShopPublicState", "setOwnShopPublicEnabled", "isPublicShopEnabled"],
  store: ["getPublicProductBySeqId", "getPublicProduct", "getPublicShopProducts"],
  superadmin: ["getSuperAdminShops", "updateShopBilling", "setShopFrozen", "impersonateShop", "getImpersonatedShop"],
  suppliers: ["getSupplierDebtData", "saveSupplierProfilePhoto", "deleteSupplierProfile", "takeProductOnConsignment", "adjustSupplierDebt", "paySupplierDebt"],
  team: ["getTeam", "approveMember", "rejectMember"],
})

export function isNativeAction(module, action) {
  return typeof module === "string" && typeof action === "string" &&
    Object.prototype.hasOwnProperty.call(NATIVE_ACTIONS, module) &&
    NATIVE_ACTIONS[module].includes(action)
}
