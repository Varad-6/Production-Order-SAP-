sap.ui.define([
  "sap/fe/core/AppComponent"
], function (AppComponent) {
  "use strict";

  // Plain Fiori Elements app component.
  //
  // NOTE: do not override init() here to set up models. Doing so prevents FE's
  // routing from initialising and the List Report never templates (the page
  // renders as empty loading skeletons with no error). The signed-in persona is
  // read from the URL by ext/RoleVisibility.js where it is needed instead.
  return AppComponent.extend("po.orders.Component", {
    metadata: { manifest: "json" }
  });
});
