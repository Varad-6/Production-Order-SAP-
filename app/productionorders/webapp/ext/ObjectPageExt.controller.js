sap.ui.define([
  "sap/ui/core/mvc/ControllerExtension",
  "po/orders/ext/RoleVisibility"
], function (ControllerExtension, RoleVisibility) {
  "use strict";

  // Applies the cosmetic role rules to the Object Page (Edit, Release, Confirm).
  return ControllerExtension.extend("po.orders.ext.ObjectPageExt", {

    override: {
      onAfterRendering: function () {
        try {
          // Read the persona straight from the URL. Deliberately NOT via a
          // component init override — that breaks Fiori Elements routing.
          var oUser = RoleVisibility.readUserFromUrl();
          RoleVisibility.apply(this.base.getView(), oUser.role);
        } catch (e) {
          // Cosmetic visibility must never break the page.
          console.warn("RoleVisibility (Object Page) skipped:", e);
        }
      }
    }
  });
});
