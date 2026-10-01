namespace abhiyanta.po;

// Domain model for the Production Order mock.
//
// IMPORTANT: every element name here mirrors SAP's API_PRODUCTION_ORDER_2_SRV.
// Do not rename anything for convenience — matching names are what let this
// demo swap to the live S/4HANA service by replacing the data source only.

/** Production order header — the entity Create / Change / Display act on. */
entity ProductionOrder {
      /** Order number, e.g. '1000000001'. Generated on create. */
  key ManufacturingOrder       : String(12);
      /** Order type, e.g. 'PP01'. */
      ManufacturingOrderType   : String(4);
      /** Finished-goods material. Mandatory on create (enforced in the handler). */
      Material                 : String(40);
      /** Plant, e.g. '1100'. */
      ProductionPlant          : String(4);
      TotalQuantity            : Decimal(13, 3);
      /** Base unit of measure, e.g. 'PC'. */
      ProductionUnit           : String(3);
      MfgOrderPlannedStartDate : Date;
      /** Planned finish date. */
      MfgOrderPlannedEndDate   : Date;
      ProductionSupervisor     : String(3);
      OrderIsReleased          : Boolean;
      /** CRTD | REL | PCNF | CNF — drives the status pill. */
      ProductionOrderStatus    : String(4);

      to_Operations            : Composition of many ProductionOrderOperation
                                   on to_Operations.ManufacturingOrder = $self.ManufacturingOrder;
      to_Components            : Composition of many ProductionOrderComponent
                                   on to_Components.ManufacturingOrder = $self.ManufacturingOrder;
}

/** Order operations. Read-only in the app — no operation create or edit. */
entity ProductionOrderOperation {
  key ManufacturingOrder              : String(12);
      /** Sequence, e.g. '000000' for the standard sequence. */
      ManufacturingOrderSequence      : String(6);
      /** Operation number, e.g. '0010'. */
  key ManufacturingOrderOperation     : String(4);
      OperationText                   : String(40);
      WorkCenter                      : String(8);
      OperationConfirmedYieldQuantity : Decimal(13, 3);
      /** CRTD | REL | PCNF | CNF */
      OperationStatus                 : String(4);
}

/** Component list (BOM explosion). Display-only — no component add. */
entity ProductionOrderComponent {
  key ManufacturingOrder : String(12);
      /** Reservation number carrying the component requirement. */
      Reservation        : String(10);
      /** Reservation item — the component's key within the order. */
  key ReservationItem    : String(4);
      /** Component material. */
      Material           : String(40);
      RequiredQuantity   : Decimal(13, 3);
      WithdrawnQuantity  : Decimal(13, 3);
      ProductionPlant    : String(4);
}

/** Append-only log of confirmation postings. One row per confirmOperation call. */
entity Confirmation {
  key ConfirmationID             : UUID;
      OrderID                    : String(12);
      Sequence                   : String(6);
      OrderOperation             : String(4);
      ConfirmationYieldQuantity  : Decimal(13, 3);
      ConfirmationScrapQuantity  : Decimal(13, 3);
      /** 'X' = final confirmation, ' ' = partial. */
      FinalConfirmationType      : String(1);
      PostingDate                : DateTime;
}
