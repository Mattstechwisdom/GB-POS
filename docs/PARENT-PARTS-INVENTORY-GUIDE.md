# Logging Parts Inventory Correctly

## Example: iPhone 7 screens

1. Open **Inventory**, select **Parts**, then choose **Create Parent Part**.
2. Name it `iPhone 7 Screen`, choose the Phone category and Screen part type, then save it. A parent is only an organizer; it has no SKU or stock and is never deducted.
3. Select the parent and choose **Add Variant**.
4. Add the attribute `Color` = `Black`. Enter the exact black-screen SKU, vendor, cost, price, on-hand count, low-stock level, and MOQ. Save it.
5. Select the parent again, choose **Add Variant** (or duplicate the black variant), and create `Color` = `White` with the white screen's own SKU and count.

Use more attributes whenever they distinguish stocked items, for example `Quality: Premium`, `Connector: USB-C`, or `Position: Left`. Each physical SKU should be one child variant.

## Pairing parts with repairs

1. Open **Devices / Repairs** and edit or create the service assignment.
2. Set a broad **Repair Family**, such as `Screen Repair` or `Port Repair`.
3. Set the reusable service, such as `Screen Replacement` or `USB Port Repair`.
4. Choose the applicable device category and exact device when pricing or labor differs.
5. Under **Linked Part Family / Standalone Part**, choose the parent part. Leave this blank only when the repair always uses one standalone inventory item.
6. Save the repair assignment.

This keeps one understandable service family while allowing PS5, laptop, controller, and phone assignments to carry their own labor, price, device scope, and part family.

## Using a part on a work order

1. Add the repair normally.
2. If it links a parent, choose the exact variant installed when prompted.
3. The work-order line keeps the service name concise but stores the exact child SKU internally.
4. Closing/checking out the work order deducts only that child variant. Retrying or reopening the completed ticket does not deduct it twice.

Sales and Quick Checkout cannot directly sell an organizational parent. Select a stocked child variant. Legacy standalone products and parts still work normally.

## Restocking

Each child variant has its own on-hand count, alert level, MOQ, vendor, and order URL. When a child is low, add that exact variant to the EOD purchasing cart. Receiving it increases only that SKU.

## Diagnostic-only tickets

A selected diagnostic remains outside the editable work-order line-item list so it can operate as a minimum labor credit. When it is the only selected service, the main work-order Items column still displays its diagnostic label.
