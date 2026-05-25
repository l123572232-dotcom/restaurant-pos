const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;

class Printer {
  constructor(type, config = {}) {
    this.type = type;

    this.printer = new ThermalPrinter({
      type: config.interface === 'network' ? Types.EPSON : Types.EPSON,
      interface: config.interface || 'tcp',
      driver: config.driver || require('node-thermal-printer').driver,
      options: config.options || {}
    });
  }

  async isConnected() {
    try {
      return await this.printer.isPrinterConnected();
    } catch {
      return false;
    }
  }

  async printLabel(orderNumber, items) {
    this.printer.alignCenter();
    this.printer.println(`#${orderNumber}`);

    for (const item of items) {
      this.printer.alignLeft();
      this.printer.println(`${item.item_name} x${item.quantity}`);
      if (item.size_name) {
        this.printer.println(`  ${item.size_name}`);
      }
      if (item.toppings && item.toppings.length > 0) {
        const toppingNames = item.toppings.map(t => t.name).join(', ');
        this.printer.println(`  + ${toppingNames}`);
      }
    }

    this.printer.cut();
    return this.printer.execute();
  }

  async printKitchenOrder(order) {
    this.printer.alignCenter();
    this.printer.bold(true);
    this.printer.println(`ORDER #${order.order_number}`);
    this.printer.bold(false);
    this.printer.drawLine();

    if (order.table_number) {
      this.printer.println(`Table: ${order.table_number}`);
    }

    this.printer.println(`Time: ${order.created_at}`);
    this.printer.drawLine();

    for (const item of order.items || []) {
      this.printer.alignLeft();
      this.printer.bold(true);
      this.printer.println(`${item.quantity}x ${item.item_name}`);
      this.printer.bold(false);

      if (item.size_name) {
        this.printer.println(`  Size: ${item.size_name}`);
      }
      if (item.toppings && item.toppings.length > 0) {
        for (const topping of item.toppings) {
          const price = topping.price_adjust ? ` (+${topping.price_adjust})` : '';
          this.printer.println(`  + ${topping.name}${price}`);
        }
      }
    }

    this.printer.drawLine();
    if (order.note) {
      this.printer.println(`Note: ${order.note}`);
    }
    this.printer.cut();
    return this.printer.execute();
  }
}

module.exports = Printer;
