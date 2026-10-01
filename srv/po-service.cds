using abhiyanta.po as po from '../db/schema';

// Production Order service — mock only. No destination, no remote service,
// no cloud SDK. Everything is served from the local SQLite database.
//
// NOTE ON SECURITY: this service is deliberately NOT role-gated. The three
// personas in the login screen are cosmetic and drive button visibility in the
// client only. A raw HTTP call here succeeds regardless of "role".
service ProductionOrderService @(path: '/service/po') {

  // ---------------------------------------------------------------------------
  // Header — the entity Create / Change / Display act on.
  // Draft enabled: Fiori Elements v4 only renders Create/Edit for draft- or
  // sticky-enabled services. CLAUDE.md asked for draft disabled, but with it off
  // FE generates no Create button at all, so Planner/Supervisor would have
  // nothing to click. Confirmed by testing both settings.
  // ---------------------------------------------------------------------------
  @odata.draft.enabled: true
  @Capabilities.DeleteRestrictions.Deletable: false  // hard scope rule: no order delete
  entity ProductionOrders as projection on po.ProductionOrder {
    *,

    // Status pill colour. OData CriticalityType has no "navy", so the four
    // statuses map to four visually distinct standard criticalities.
    case ProductionOrderStatus
      when 'CRTD' then 0  // Neutral      — grey
      when 'REL'  then 5  // Information  — blue
      when 'PCNF' then 2  // Critical     — orange
      when 'CNF'  then 3  // Positive     — green
      else 0
    end as StatusCriticality : Integer,

    // Action visibility driven by status (hidden, not greyed out).
    case when ProductionOrderStatus =  'CRTD'           then false else true end as ReleaseIsHidden : Boolean,
    case when ProductionOrderStatus in ('REL', 'PCNF')  then false else true end as ConfirmIsHidden : Boolean

  } actions {

    /** Release a CRTD order: status -> REL, OrderIsReleased -> true. */
    action releaseOrder() returns ProductionOrders;

    /** Confirm yield/scrap on one operation. Partial -> PCNF, final -> CNF. */
    action confirmOperation(
      ManufacturingOrderOperation : String(4)      @title: 'Operation'        @mandatory,
      // Leave blank to confirm the full open quantity.
      ConfirmationYieldQuantity   : Decimal(13, 3) @title: 'Yield Quantity',
      ConfirmationScrapQuantity   : Decimal(13, 3) @title: 'Scrap Quantity',
      FinalConfirmation           : Boolean        @title: 'Final Confirmation'
    ) returns ProductionOrders;
  }

  // Operations and components are display-only — hard scope boundary.
  // No operation create/edit, no component add.
  @readonly
  entity ProductionOrderOperations as projection on po.ProductionOrderOperation {
    *,
    case OperationStatus
      when 'CRTD' then 0
      when 'REL'  then 5
      when 'PCNF' then 2
      when 'CNF'  then 3
      else 0
    end as StatusCriticality : Integer
  };

  @readonly
  entity ProductionOrderComponents as projection on po.ProductionOrderComponent;

  // Append-only confirmation log.
  @readonly
  entity Confirmations as projection on po.Confirmation;
}

// =============================================================================
// Field labels
// =============================================================================
annotate ProductionOrderService.ProductionOrders with {
  ManufacturingOrder       @title: 'Order';
  ManufacturingOrderType   @title: 'Order Type';
  // Not @mandatory: CAP's generic assert would fire before the create handler
  // and mask the readable message the spec asks for. The handler owns this.
  Material                 @title: 'Material';
  ProductionPlant          @title: 'Plant';
  TotalQuantity            @title: 'Total Quantity'    @Measures.Unit: ProductionUnit;
  ProductionUnit           @title: 'Unit';
  MfgOrderPlannedStartDate @title: 'Planned Start';
  MfgOrderPlannedEndDate   @title: 'Planned Finish';
  ProductionSupervisor     @title: 'Supervisor';
  OrderIsReleased          @title: 'Released';
  ProductionOrderStatus    @title: 'Status';
}

// Change = header only. Only TotalQuantity and the two dates are editable;
// everything else is locked once the order exists. Hard rule, not a UX preference.
//
// These fields are set on CREATE but must not change afterwards, so they are
// NonUpdatable rather than @readonly — @readonly would strip them from the
// create payload too, and Material is mandatory on create.
annotate ProductionOrderService.ProductionOrders with @(
  Capabilities.UpdateRestrictions.NonUpdatableProperties: [
    ManufacturingOrderType,
    Material,
    ProductionPlant,
    ProductionUnit,
    ProductionSupervisor
  ]
);

// Fully system-maintained — never accepted from the client, on create or change.
annotate ProductionOrderService.ProductionOrders with {
  ManufacturingOrder    @readonly;  // generated in the create handler
  OrderIsReleased       @readonly;  // set by releaseOrder
  ProductionOrderStatus @readonly;  // set by the handlers
}

annotate ProductionOrderService.ProductionOrderOperations with {
  ManufacturingOrderOperation     @title: 'Operation';
  ManufacturingOrderSequence      @title: 'Sequence';
  OperationText                   @title: 'Description';
  WorkCenter                      @title: 'Work Center';
  OperationConfirmedYieldQuantity @title: 'Confirmed Yield';
  OperationStatus                 @title: 'Status';
}

annotate ProductionOrderService.ProductionOrderComponents with {
  Material          @title: 'Component';
  RequiredQuantity  @title: 'Required Qty';
  WithdrawnQuantity @title: 'Withdrawn Qty';
  ProductionPlant   @title: 'Plant';
  Reservation       @title: 'Reservation';
  ReservationItem   @title: 'Item';
}

// =============================================================================
// List Report
// =============================================================================
annotate ProductionOrderService.ProductionOrders with @(

  UI.SelectionFields: [
    Material,
    ProductionPlant,
    ManufacturingOrderType,
    ProductionOrderStatus
  ],

  UI.LineItem: [
    { $Type: 'UI.DataField', Value: ManufacturingOrder },
    { $Type: 'UI.DataField', Value: Material },
    { $Type: 'UI.DataField', Value: ProductionPlant },
    { $Type: 'UI.DataField', Value: TotalQuantity },
    { $Type: 'UI.DataField', Value: MfgOrderPlannedEndDate },
    { $Type: 'UI.DataField', Value: ProductionOrderStatus, Criticality: StatusCriticality },
    {
      $Type      : 'UI.DataFieldForAction',
      Label      : 'Release',
      Action     : 'ProductionOrderService.releaseOrder',
      ![@UI.Hidden]: ReleaseIsHidden
    },
    {
      $Type      : 'UI.DataFieldForAction',
      Label      : 'Confirm',
      Action     : 'ProductionOrderService.confirmOperation',
      ![@UI.Hidden]: ConfirmIsHidden
    }
  ]
);

// =============================================================================
// Object Page
// =============================================================================
annotate ProductionOrderService.ProductionOrders with @(

  UI.HeaderInfo: {
    TypeName      : 'Production Order',
    TypeNamePlural: 'Production Orders',
    Title         : { $Type: 'UI.DataField', Value: ManufacturingOrder },
    Description   : { $Type: 'UI.DataField', Value: Material }
  },

  // Status pill in the object-page header.
  UI.HeaderFacets: [
    { $Type: 'UI.ReferenceFacet', ID: 'StatusFacet', Target: '@UI.FieldGroup#Status' }
  ],
  UI.FieldGroup #Status: {
    Data: [
      { $Type: 'UI.DataField', Value: ProductionOrderStatus, Criticality: StatusCriticality }
    ]
  },

  // Actions on the object page.
  UI.Identification: [
    {
      $Type      : 'UI.DataFieldForAction',
      Label      : 'Release',
      Action     : 'ProductionOrderService.releaseOrder',
      ![@UI.Hidden]: ReleaseIsHidden
    },
    {
      $Type      : 'UI.DataFieldForAction',
      Label      : 'Confirm',
      Action     : 'ProductionOrderService.confirmOperation',
      ![@UI.Hidden]: ConfirmIsHidden
    }
  ],

  UI.FieldGroup #General: {
    Data: [
      { $Type: 'UI.DataField', Value: ManufacturingOrder },
      { $Type: 'UI.DataField', Value: ManufacturingOrderType },
      { $Type: 'UI.DataField', Value: Material },
      { $Type: 'UI.DataField', Value: ProductionPlant },
      { $Type: 'UI.DataField', Value: ProductionSupervisor }
    ]
  },

  UI.FieldGroup #Quantities: {
    Data: [
      { $Type: 'UI.DataField', Value: TotalQuantity },
      { $Type: 'UI.DataField', Value: MfgOrderPlannedStartDate },
      { $Type: 'UI.DataField', Value: MfgOrderPlannedEndDate },
      { $Type: 'UI.DataField', Value: OrderIsReleased }
    ]
  },

  UI.Facets: [
    {
      $Type : 'UI.CollectionFacet',
      ID    : 'HeaderFacet',
      Label : 'Order Details',
      Facets: [
        { $Type: 'UI.ReferenceFacet', ID: 'GeneralFacet',    Label: 'General',            Target: '@UI.FieldGroup#General' },
        { $Type: 'UI.ReferenceFacet', ID: 'QuantitiesFacet', Label: 'Quantities & Dates', Target: '@UI.FieldGroup#Quantities' }
      ]
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'OperationsFacet',
      Label : 'Operations',
      Target: 'to_Operations/@UI.LineItem'
    },
    {
      $Type : 'UI.ReferenceFacet',
      ID    : 'ComponentsFacet',
      Label : 'Components',
      Target: 'to_Components/@UI.LineItem'
    }
  ]
);

// Operations table (read-only facet).
annotate ProductionOrderService.ProductionOrderOperations with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: ManufacturingOrderOperation },
    { $Type: 'UI.DataField', Value: OperationText },
    { $Type: 'UI.DataField', Value: WorkCenter },
    { $Type: 'UI.DataField', Value: OperationConfirmedYieldQuantity },
    { $Type: 'UI.DataField', Value: OperationStatus, Criticality: StatusCriticality }
  ]
);

// Components table (read-only facet — display only, no add).
annotate ProductionOrderService.ProductionOrderComponents with @(
  UI.LineItem: [
    { $Type: 'UI.DataField', Value: ReservationItem },
    { $Type: 'UI.DataField', Value: Material },
    { $Type: 'UI.DataField', Value: RequiredQuantity },
    { $Type: 'UI.DataField', Value: WithdrawnQuantity },
    { $Type: 'UI.DataField', Value: ProductionPlant }
  ]
);
