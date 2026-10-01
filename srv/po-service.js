import cds from '@sap/cds';

// Custom handlers for the Production Order mock.
// All data lives in the local SQLite database — no external calls anywhere.

export default (srv) => {
  const { ProductionOrders } = srv.entities;

  // Underlying db entities. Operations are @readonly in the service (no
  // operation create/edit through the UI), so writes go to the db level.
  const db = () => cds.entities('abhiyanta.po');

  // ---------------------------------------------------------------------------
  // CREATE — header only.
  //
  // The service is draft-enabled, so creating happens in two steps: a new draft
  // is opened first (NEW), then activated (SAVE). Identity and defaults are set
  // when the draft opens; Material is validated on activation, because a fresh
  // draft legitimately starts empty and would otherwise be rejected instantly.
  // ---------------------------------------------------------------------------
  srv.before('NEW', ProductionOrders.drafts, async (req) => {
    const order = req.data;

    order.ManufacturingOrder = await nextOrderNumber();
    order.ProductionOrderStatus = 'CRTD';
    order.OrderIsReleased = false;

    // Sensible demo defaults so a minimal create still looks like a real order.
    order.ManufacturingOrderType ??= 'PP01';
    order.ProductionPlant ??= '1100';
    order.ProductionUnit ??= 'PC';
    order.MfgOrderPlannedStartDate ??= today();
  });

  // Material is mandatory — checked when the draft is activated.
  srv.before('SAVE', ProductionOrders, (req) => {
    if (!req.data.Material?.trim()) {
      return req.error(400, 'Material is required to create a production order.', 'in/Material');
    }
  });

  // Seed two mock operations so a newly created order is confirmable.
  // Runs on every activation, so it checks first and does nothing when the
  // order already has operations (i.e. when an existing order was just edited).
  srv.after('SAVE', ProductionOrders, async (order, req) => {
    const orderNo = order?.ManufacturingOrder ?? req.data.ManufacturingOrder;
    if (!orderNo) return;

    const { ProductionOrderOperation } = db();
    const existing = await SELECT.from(ProductionOrderOperation)
      .where({ ManufacturingOrder: orderNo });
    if (existing.length) return;

    await INSERT.into(ProductionOrderOperation).entries([
      operation(orderNo, '0010', 'Machine parts', 'WC-MACH1'),
      operation(orderNo, '0020', 'Assemble and test', 'WC-ASSY1')
    ]);
  });

  // ---------------------------------------------------------------------------
  // UPDATE — header only: quantity and the two dates, nothing else.
  //
  // NonUpdatableProperties in the CDS is only a protocol hint (Fiori Elements
  // honours it, the runtime does not), so the hard rule is enforced here too.
  // ---------------------------------------------------------------------------
  const CHANGEABLE = ['TotalQuantity', 'MfgOrderPlannedStartDate', 'MfgOrderPlannedEndDate'];

  srv.before('UPDATE', ProductionOrders, (req) => {
    const locked = Object.keys(req.data)
      .filter((f) => !CHANGEABLE.includes(f) && f !== 'ManufacturingOrder');
    if (locked.length) {
      return req.error(400,
        `Only ${CHANGEABLE.join(', ')} can be changed on an existing order. Not changeable: ${locked.join(', ')}.`);
    }
  });

  // ---------------------------------------------------------------------------
  // releaseOrder — CRTD -> REL
  // ---------------------------------------------------------------------------
  srv.on('releaseOrder', ProductionOrders, async (req) => {
    const { ManufacturingOrder } = req.params[0];
    const order = await SELECT.one.from(ProductionOrders).where({ ManufacturingOrder });

    if (!order) return req.error(404, `Production order ${ManufacturingOrder} not found.`);
    if (order.ProductionOrderStatus !== 'CRTD') {
      return req.error(400,
        `Only orders with status CRTD can be released. Order ${ManufacturingOrder} is ${order.ProductionOrderStatus}.`);
    }

    const { ProductionOrder, ProductionOrderOperation } = db();
    await UPDATE(ProductionOrder).set({ ProductionOrderStatus: 'REL', OrderIsReleased: true })
      .where({ ManufacturingOrder });
    await UPDATE(ProductionOrderOperation).set({ OperationStatus: 'REL' })
      .where({ ManufacturingOrder, OperationStatus: 'CRTD' });

    return SELECT.one.from(ProductionOrders).where({ ManufacturingOrder });
  });

  // ---------------------------------------------------------------------------
  // confirmOperation — post yield/scrap, roll status to PCNF or CNF
  // ---------------------------------------------------------------------------
  srv.on('confirmOperation', ProductionOrders, async (req) => {
    const { ManufacturingOrder } = req.params[0];
    const {
      ManufacturingOrderOperation: operationNo,
      ConfirmationScrapQuantity: scrap = 0,
      FinalConfirmation: isFinal = false
    } = req.data;

    const { ProductionOrder, ProductionOrderOperation, Confirmation } = db();

    const order = await SELECT.one.from(ProductionOrders).where({ ManufacturingOrder });
    if (!order) return req.error(404, `Production order ${ManufacturingOrder} not found.`);
    if (!['REL', 'PCNF'].includes(order.ProductionOrderStatus)) {
      return req.error(400,
        `Only released orders can be confirmed. Order ${ManufacturingOrder} is ${order.ProductionOrderStatus}.`);
    }

    const op = await SELECT.one.from(ProductionOrderOperation)
      .where({ ManufacturingOrder, ManufacturingOrderOperation: operationNo });
    if (!op) return req.error(400, `Operation ${operationNo} does not exist on order ${ManufacturingOrder}.`);
    if (op.OperationStatus === 'CNF') {
      return req.error(400, `Operation ${operationNo} is already finally confirmed.`);
    }

    // Open quantity is what is left to confirm on this operation.
    const open = Number(order.TotalQuantity) - Number(op.OperationConfirmedYieldQuantity ?? 0);
    const yieldQty = Number(req.data.ConfirmationYieldQuantity ?? open); // blank = confirm the rest

    if (yieldQty <= 0) return req.error(400, 'Yield quantity must be greater than zero.');
    if (yieldQty > open) {
      return req.error(400,
        `Yield quantity ${yieldQty} exceeds the open quantity ${open} for operation ${operationNo}.`,
        'in/ConfirmationYieldQuantity');
    }

    // 1. Log the posting.
    await INSERT.into(Confirmation).entries({
      ConfirmationID: cds.utils.uuid(),
      OrderID: ManufacturingOrder,
      Sequence: op.ManufacturingOrderSequence,
      OrderOperation: operationNo,
      ConfirmationYieldQuantity: yieldQty,
      ConfirmationScrapQuantity: Number(scrap),
      FinalConfirmationType: isFinal ? 'X' : ' ',
      PostingDate: new Date().toISOString()
    });

    // 2. Update the operation.
    await UPDATE(ProductionOrderOperation)
      .set({
        OperationConfirmedYieldQuantity: Number(op.OperationConfirmedYieldQuantity ?? 0) + yieldQty,
        OperationStatus: isFinal ? 'CNF' : 'PCNF'
      })
      .where({ ManufacturingOrder, ManufacturingOrderOperation: operationNo });

    // 3. Roll up the order: CNF only once every operation is finally confirmed.
    const operations = await SELECT.from(ProductionOrderOperation).where({ ManufacturingOrder });
    const allDone = operations.every((o) => o.OperationStatus === 'CNF');
    await UPDATE(ProductionOrder)
      .set({ ProductionOrderStatus: allDone ? 'CNF' : 'PCNF' })
      .where({ ManufacturingOrder });

    return SELECT.one.from(ProductionOrders).where({ ManufacturingOrder });
  });

  // --- helpers ---------------------------------------------------------------

  /** Next order number, continuing the 10-digit seeded range (1000000001...). */
  async function nextOrderNumber() {
    const { ProductionOrder } = db();
    const [{ last }] = await SELECT.from(ProductionOrder)
      .columns('max(ManufacturingOrder) as last');
    return String(Number(last ?? 1000000000) + 1);
  }

  const operation = (ManufacturingOrder, ManufacturingOrderOperation, OperationText, WorkCenter) => ({
    ManufacturingOrder,
    ManufacturingOrderSequence: '000000',
    ManufacturingOrderOperation,
    OperationText,
    WorkCenter,
    OperationConfirmedYieldQuantity: 0,
    OperationStatus: 'CRTD'
  });

  const today = () => new Date().toISOString().slice(0, 10);
};
