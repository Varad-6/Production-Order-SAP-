sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
  "use strict";

  // ===========================================================================
  // MOCK LOGIN CONTROLLER — NOT REAL AUTHENTICATION.
  //
  // The three personas are hard-coded here. Selecting one hands the role to the
  // Fiori Elements app, which uses it to show or hide action buttons. No
  // password is checked and the CAP service is not role-gated.
  //
  // Role names match the future XSUAA role collections (PO_Planner /
  // PO_Operator / PO_Supervisor), so when real auth replaces this screen the
  // button-visibility logic downstream can stay exactly as it is.
  // ===========================================================================

  var PERSONAS = [
    {
      firstName: "Priya",
      name: "Priya Sharma",
      role: "PO_Planner",
      roleLabel: "Planner",
      icon: "sap-icon://calendar",
      description: "Plans and schedules production from the office. Decides what gets built and when.",
      can: "Display, Create, Change, Release"
    },
    {
      firstName: "Ravi",
      name: "Ravi Kumar",
      role: "PO_Operator",
      roleLabel: "Operator",
      icon: "sap-icon://factory",
      description: "Works the machine. Reports yield and scrap as the work happens.",
      can: "Display, Confirm"
    },
    {
      firstName: "Meera",
      name: "Meera Nair",
      role: "PO_Supervisor",
      roleLabel: "Supervisor",
      icon: "sap-icon://manager",
      description: "Runs the line, handles exceptions, can step in anywhere.",
      can: "Everything"
    }
  ];

  return Controller.extend("po.login.controller.Login", {

    onInit: function () {
      // Client-side JSONModel only — no browser storage anywhere in this demo.
      this.getView().setModel(new JSONModel({ personas: PERSONAS }), "personas");
    },

    /**
     * "Log in" pressed. Hands the chosen persona to the Fiori Elements app as
     * URL parameters — deliberately not sessionStorage/localStorage, per the
     * no-browser-storage rule. The FE app reads them straight into a JSONModel.
     */
    onLogin: function (oEvent) {
      var oPersona = oEvent.getSource().getBindingContext("personas").getObject();

      var sUrl = "../../productionorders/webapp/index.html"
        + "?user=" + encodeURIComponent(oPersona.name)
        + "&role=" + encodeURIComponent(oPersona.role)
        + "&roleLabel=" + encodeURIComponent(oPersona.roleLabel);

      window.location.href = sUrl;
    }
  });
});
