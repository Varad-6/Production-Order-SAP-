sap.ui.define([], function () {
  "use strict";

  // ===========================================================================
  // COSMETIC ROLE VISIBILITY — NOT SECURITY.
  //
  // Hides action buttons based on the persona chosen on the mock login screen.
  // The CAP service is deliberately not role-gated: a raw HTTP call still
  // succeeds in any role. This only decides what is drawn on screen.
  //
  // Buttons are hidden, never greyed out, per the UI Design Guide.
  //
  // Role names match the future XSUAA role collections, so when real auth
  // replaces the login screen these rules can stay exactly as they are.
  // ===========================================================================

  var RULES = {
    PO_Planner:    { create: true,  change: true,  release: true,  confirm: false },
    PO_Operator:   { create: false, change: false, release: false, confirm: true  },
    PO_Supervisor: { create: true,  change: true,  release: true,  confirm: true  }
  };

  var DEFAULT_USER = {
    name: "Meera Nair",
    role: "PO_Supervisor",
    roleLabel: "Supervisor"
  };

  // Fiori Elements button-id fragments for the actions we care about.
  var MATCHERS = {
    create:  /StandardAction::Create|::CreateButton|::Create$/,
    change:  /StandardAction::Edit|::EditButton|::Edit$/,
    release: /releaseOrder/,
    confirm: /confirmOperation/,
    delete:  /StandardAction::Delete|::DeleteButton|::Delete$/
  };

  return {

    /** Reads the persona handed over by the mock login screen. */
    readUserFromUrl: function () {
      var sSearch = window.location.search;

      // Under the FLP sandbox the parameters can end up after the hash.
      if (!sSearch && window.location.hash.indexOf("?") > -1) {
        sSearch = window.location.hash.slice(window.location.hash.indexOf("?"));
      }

      var oParams = new URLSearchParams(sSearch);
      var sRole = oParams.get("role");

      if (!RULES[sRole]) {
        return Object.assign({}, DEFAULT_USER);
      }

      return {
        name: oParams.get("user") || DEFAULT_USER.name,
        role: sRole,
        roleLabel: oParams.get("roleLabel") || ""
      };
    },

    /** The visibility rules for a role. */
    getRules: function (sRole) {
      return RULES[sRole] || RULES.PO_Supervisor;
    },

    /**
     * Hides the buttons this role may not use.
     *
     * Fiori Elements builds its action buttons asynchronously as data arrives,
     * so this is re-applied a few times rather than once on render.
     */
    apply: function (oView, sRole) {
      var oRules = this.getRules(sRole);
      var that = this;

      var fnHide = function () {
        var aButtons = oView.findAggregatedObjects(true, function (oControl) {
          return oControl.isA && oControl.isA("sap.m.Button");
        });

        aButtons.forEach(function (oButton) {
          var sId = oButton.getId();

          Object.keys(MATCHERS).forEach(function (sAction) {
            if (!MATCHERS[sAction].test(sId)) return;

            // No order delete, in any role — hard scope boundary.
            var bAllowed = sAction === "delete" ? false : oRules[sAction];

            if (!bAllowed && oButton.getVisible()) {
              oButton.setVisible(false);
            }
          });
        });
      };

      fnHide();
      [300, 800, 1500, 2500].forEach(function (iDelay) {
        setTimeout(fnHide, iDelay);
      });
    }
  };
});
