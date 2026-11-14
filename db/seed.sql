-- GuardSQL MCP - demo e-commerce seed data.
-- Deterministic, internally consistent data: order totals and payment amounts are
-- derived from order_items so the numbers always add up.

-- ---------------------------------------------------------------- customers
INSERT INTO customers (id, name, email, country, created_at) VALUES
  (1,  'Alice Nguyen', 'alice.nguyen@example.com', 'US', '2025-01-04 09:15:00+00'),
  (2,  'Mateo Rossi',  'mateo.rossi@example.it',   'IT', '2025-01-09 14:32:00+00'),
  (3,  'Yuki Tanaka',  'yuki.tanaka@example.jp',   'JP', '2025-01-15 02:05:00+00'),
  (4,  'Liam O''Brien','liam.obrien@example.ie',   'IE', '2025-01-21 18:47:00+00'),
  (5,  'Sofia Almeida','sofia.almeida@example.pt', 'PT', '2025-02-02 11:20:00+00'),
  (6,  'Noah Schmidt', 'noah.schmidt@example.de',  'DE', '2025-02-08 07:58:00+00'),
  (7,  'Emma Jensen',  'emma.jensen@example.dk',   'DK', '2025-02-14 16:10:00+00'),
  (8,  'Lucas Silva',  'lucas.silva@example.br',   'BR', '2025-02-20 20:41:00+00'),
  (9,  'Aisha Khan',   'aisha.khan@example.pk',    'PK', '2025-03-01 05:26:00+00'),
  (10, 'Chen Wei',     'chen.wei@example.cn',      'CN', '2025-03-06 13:03:00+00'),
  (11, 'Priya Patel',  'priya.patel@example.in',   'IN', '2025-03-12 22:19:00+00'),
  (12, 'Olivia Brown', 'olivia.brown@example.uk',  'GB', '2025-03-18 08:44:00+00'),
  (13, 'Daniel Kim',   'daniel.kim@example.kr',    'KR', '2025-03-25 04:52:00+00'),
  (14, 'Fatima Zahra', 'fatima.zahra@example.ma',  'MA', '2025-04-01 17:37:00+00'),
  (15, 'Ivan Petrov',  'ivan.petrov@example.ru',   'RU', '2025-04-07 12:11:00+00'),
  (16, 'Grace Mensah', 'grace.mensah@example.gh',  'GH', '2025-04-13 09:29:00+00');

-- ----------------------------------------------------------------- products
INSERT INTO products (id, sku, name, category, price_cents, stock, created_at) VALUES
  (1,  'KB-001', 'Mechanical Keyboard',     'Peripherals',  8900, 120, '2025-01-02 08:00:00+00'),
  (2,  'MS-002', 'Wireless Mouse',          'Peripherals',  3400, 200, '2025-01-02 08:05:00+00'),
  (3,  'MN-003', '27" 4K Monitor',          'Displays',    32900,  45, '2025-01-03 08:00:00+00'),
  (4,  'MN-004', '24" FHD Monitor',         'Displays',    15900,  80, '2025-01-03 08:10:00+00'),
  (5,  'LT-005', 'Ultrabook 14"',           'Laptops',    129900,  20, '2025-01-05 08:00:00+00'),
  (6,  'LT-006', 'Gaming Laptop 16"',       'Laptops',    189900,  12, '2025-01-05 08:20:00+00'),
  (7,  'HP-007', 'Over-Ear Headphones',     'Audio',       19900,  90, '2025-01-06 09:00:00+00'),
  (8,  'HP-008', 'True Wireless Earbuds',   'Audio',        9900, 150, '2025-01-06 09:15:00+00'),
  (9,  'SP-009', 'Bluetooth Speaker',       'Audio',        5900, 110, '2025-01-06 09:30:00+00'),
  (10, 'CB-010', 'USB-C Cable 2m',          'Accessories',  1200, 500, '2025-01-07 10:00:00+00'),
  (11, 'CB-011', 'HDMI 2.1 Cable',          'Accessories',  1800, 300, '2025-01-07 10:05:00+00'),
  (12, 'PS-012', '65W GaN Charger',         'Accessories',  3900, 180, '2025-01-08 10:00:00+00'),
  (13, 'PS-013', '100W GaN Charger',        'Accessories',  5900, 140, '2025-01-08 10:10:00+00'),
  (14, 'HD-014', 'USB Hub 7-Port',          'Accessories',  4500, 160, '2025-01-09 11:00:00+00'),
  (15, 'HD-015', 'Docking Station',         'Accessories', 12900,  70, '2025-01-09 11:20:00+00'),
  (16, 'ST-016', 'Portable SSD 1TB',        'Storage',     11900,  95, '2025-01-10 12:00:00+00'),
  (17, 'ST-017', 'Portable SSD 2TB',        'Storage',     19900,  60, '2025-01-10 12:15:00+00'),
  (18, 'ST-018', 'microSD 256GB',           'Storage',      2900, 220, '2025-01-10 12:30:00+00'),
  (19, 'WB-019', '1080p Webcam',            'Video',        6900, 130, '2025-01-11 13:00:00+00'),
  (20, 'WB-020', '4K Webcam',               'Video',       14900,  55, '2025-01-11 13:20:00+00'),
  (21, 'MC-021', 'USB Condenser Microphone','Audio',        7900, 100, '2025-01-12 14:00:00+00'),
  (22, 'CH-022', 'Ergonomic Chair',         'Furniture',   24900,  40, '2025-01-13 15:00:00+00'),
  (23, 'DK-023', 'Standing Desk 120cm',     'Furniture',   39900,  25, '2025-01-13 15:30:00+00'),
  (24, 'LP-024', 'LED Desk Lamp',           'Furniture',    3900, 150, '2025-01-14 16:00:00+00');

-- ------------------------------------------------------------------- orders
-- total_cents is filled in below from order_items to keep everything consistent.
INSERT INTO orders (id, customer_id, status, total_cents, created_at) VALUES
  (1,  1,  'delivered', 0, '2025-06-02 10:12:00+00'),
  (2,  2,  'shipped',   0, '2025-06-05 13:44:00+00'),
  (3,  3,  'paid',      0, '2025-06-08 01:20:00+00'),
  (4,  4,  'delivered', 0, '2025-06-11 19:05:00+00'),
  (5,  5,  'cancelled', 0, '2025-06-12 08:31:00+00'),
  (6,  6,  'paid',      0, '2025-06-15 06:59:00+00'),
  (7,  7,  'delivered', 0, '2025-06-18 15:22:00+00'),
  (8,  8,  'pending',   0, '2025-06-20 21:47:00+00'),
  (9,  9,  'paid',      0, '2025-06-22 04:16:00+00'),
  (10, 10, 'shipped',   0, '2025-06-25 12:38:00+00'),
  (11, 1,  'delivered', 0, '2025-07-01 09:03:00+00'),
  (12, 11, 'paid',      0, '2025-07-03 23:14:00+00'),
  (13, 12, 'pending',   0, '2025-07-05 07:26:00+00'),
  (14, 13, 'delivered', 0, '2025-07-08 03:51:00+00'),
  (15, 14, 'shipped',   0, '2025-07-10 16:42:00+00'),
  (16, 15, 'paid',      0, '2025-07-12 11:08:00+00'),
  (17, 16, 'delivered', 0, '2025-07-15 08:37:00+00'),
  (18, 2,  'pending',   0, '2025-07-18 14:55:00+00'),
  (19, 3,  'paid',      0, '2025-07-20 02:29:00+00'),
  (20, 4,  'refunded',  0, '2025-07-22 18:13:00+00'),
  (21, 5,  'delivered', 0, '2025-07-25 10:44:00+00'),
  (22, 6,  'paid',      0, '2025-07-28 05:58:00+00'),
  (23, 7,  'shipped',   0, '2025-08-01 17:21:00+00'),
  (24, 8,  'paid',      0, '2025-08-03 20:36:00+00'),
  (25, 9,  'pending',   0, '2025-08-06 01:47:00+00'),
  (26, 10, 'delivered', 0, '2025-08-08 13:09:00+00'),
  (27, 11, 'paid',      0, '2025-08-11 22:33:00+00'),
  (28, 12, 'shipped',   0, '2025-08-14 09:57:00+00'),
  (29, 13, 'delivered', 0, '2025-08-17 04:26:00+00'),
  (30, 14, 'paid',      0, '2025-08-20 15:48:00+00'),
  (31, 15, 'cancelled', 0, '2025-08-22 12:02:00+00'),
  (32, 16, 'paid',      0, '2025-08-25 08:19:00+00'),
  (33, 1,  'shipped',   0, '2025-08-28 19:35:00+00'),
  (34, 2,  'delivered', 0, '2025-09-01 06:12:00+00'),
  (35, 3,  'paid',      0, '2025-09-04 23:47:00+00'),
  (36, 4,  'pending',   0, '2025-09-07 10:28:00+00'),
  (37, 5,  'delivered', 0, '2025-09-10 03:16:00+00'),
  (38, 6,  'paid',      0, '2025-09-13 16:54:00+00'),
  (39, 7,  'shipped',   0, '2025-09-16 11:41:00+00'),
  (40, 8,  'delivered', 0, '2025-09-19 07:23:00+00');

-- -------------------------------------------------------------- order_items
INSERT INTO order_items (order_id, product_id, qty, unit_price_cents) VALUES
  (1,  1,  1, 8900), (1,  10, 2, 1200),
  (2,  3,  1, 32900),
  (3,  5,  1, 129900), (3,  12, 1, 3900),
  (4,  2,  1, 3400),  (4,  8,  1, 9900),
  (5,  22, 1, 24900),
  (6,  6,  1, 189900),
  (7,  7,  1, 19900), (7,  16, 1, 11900),
  (8,  11, 1, 1800),  (8,  10, 1, 1200),
  (9,  4,  2, 15900),
  (10, 15, 1, 12900), (10, 14, 1, 4500),
  (11, 9,  1, 5900),
  (12, 13, 1, 5900),  (12, 18, 2, 2900),
  (13, 24, 1, 3900),
  (14, 17, 1, 19900),
  (15, 19, 1, 6900),
  (16, 20, 1, 14900), (16, 21, 1, 7900),
  (17, 23, 1, 39900),
  (18, 2,  2, 3400),  (18, 10, 3, 1200),
  (19, 5,  1, 129900),
  (20, 8,  1, 9900),
  (21, 7,  1, 19900),
  (22, 16, 1, 11900), (22, 18, 1, 2900),
  (23, 1,  1, 8900),  (23, 2,  1, 3400),
  (24, 3,  1, 32900),
  (25, 12, 1, 3900),
  (26, 6,  1, 189900), (26, 13, 1, 5900),
  (27, 4,  1, 15900),
  (28, 14, 1, 4500),  (28, 15, 1, 12900),
  (29, 21, 1, 7900),
  (30, 17, 1, 19900), (30, 16, 1, 11900),
  (31, 22, 1, 24900),
  (32, 13, 2, 5900),
  (33, 10, 2, 1200),  (33, 11, 1, 1800),
  (34, 7,  1, 19900), (34, 9,  1, 5900),
  (35, 5,  1, 129900), (35, 15, 1, 12900),
  (36, 24, 2, 3900),
  (37, 8,  1, 9900),
  (38, 20, 1, 14900),
  (39, 16, 1, 11900),
  (40, 3,  1, 32900), (40, 4,  1, 15900);

-- Keep order totals consistent with their line items.
UPDATE orders o
SET total_cents = sub.total
FROM (
    SELECT order_id, SUM(qty * unit_price_cents) AS total
    FROM order_items
    GROUP BY order_id
) AS sub
WHERE o.id = sub.order_id;

-- ----------------------------------------------------------------- payments
-- pending orders are merely authorized; cancelled/refunded orders carry the
-- corresponding terminal status.
INSERT INTO payments (order_id, provider, status, amount_cents, created_at) VALUES
  (1,  'stripe',   'captured',   0, '2025-06-02 10:14:00+00'),
  (2,  'paypal',   'captured',   0, '2025-06-05 13:46:00+00'),
  (3,  'adyen',    'captured',   0, '2025-06-08 01:22:00+00'),
  (4,  'stripe',   'captured',   0, '2025-06-11 19:07:00+00'),
  (5,  'braintree','failed',     0, '2025-06-12 08:33:00+00'),
  (6,  'checkout', 'captured',   0, '2025-06-15 07:01:00+00'),
  (7,  'stripe',   'captured',   0, '2025-06-18 15:24:00+00'),
  (8,  'paypal',   'authorized', 0, '2025-06-20 21:49:00+00'),
  (9,  'adyen',    'captured',   0, '2025-06-22 04:18:00+00'),
  (10, 'stripe',   'captured',   0, '2025-06-25 12:40:00+00'),
  (11, 'paypal',   'captured',   0, '2025-07-01 09:05:00+00'),
  (12, 'braintree','captured',   0, '2025-07-03 23:16:00+00'),
  (13, 'stripe',   'authorized', 0, '2025-07-05 07:28:00+00'),
  (14, 'checkout', 'captured',   0, '2025-07-08 03:53:00+00'),
  (15, 'adyen',    'captured',   0, '2025-07-10 16:44:00+00'),
  (16, 'stripe',   'captured',   0, '2025-07-12 11:10:00+00'),
  (17, 'paypal',   'captured',   0, '2025-07-15 08:39:00+00'),
  (18, 'stripe',   'authorized', 0, '2025-07-18 14:57:00+00'),
  (19, 'braintree','captured',   0, '2025-07-20 02:31:00+00'),
  (20, 'adyen',    'refunded',   0, '2025-07-22 18:15:00+00'),
  (21, 'stripe',   'captured',   0, '2025-07-25 10:46:00+00'),
  (22, 'paypal',   'captured',   0, '2025-07-28 06:00:00+00'),
  (23, 'checkout', 'captured',   0, '2025-08-01 17:23:00+00'),
  (24, 'stripe',   'captured',   0, '2025-08-03 20:38:00+00'),
  (25, 'adyen',    'authorized', 0, '2025-08-06 01:49:00+00'),
  (26, 'stripe',   'captured',   0, '2025-08-08 13:11:00+00'),
  (27, 'paypal',   'captured',   0, '2025-08-11 22:35:00+00'),
  (28, 'braintree','captured',   0, '2025-08-14 09:59:00+00'),
  (29, 'stripe',   'captured',   0, '2025-08-17 04:28:00+00'),
  (30, 'checkout', 'captured',   0, '2025-08-20 15:50:00+00'),
  (32, 'stripe',   'captured',   0, '2025-08-25 08:21:00+00'),
  (33, 'paypal',   'captured',   0, '2025-08-28 19:37:00+00'),
  (34, 'adyen',    'captured',   0, '2025-09-01 06:14:00+00'),
  (35, 'stripe',   'captured',   0, '2025-09-04 23:49:00+00'),
  (36, 'stripe',   'authorized', 0, '2025-09-07 10:30:00+00'),
  (37, 'braintree','captured',   0, '2025-09-10 03:18:00+00'),
  (38, 'checkout', 'captured',   0, '2025-09-13 16:56:00+00'),
  (39, 'stripe',   'captured',   0, '2025-09-16 11:43:00+00'),
  (40, 'paypal',   'captured',   0, '2025-09-19 07:25:00+00');

-- Payment amount mirrors the order total.
UPDATE payments p
SET amount_cents = o.total_cents
FROM orders o
WHERE p.order_id = o.id;

-- Keep sequences in sync with the explicit ids above.
SELECT setval('customers_id_seq',  (SELECT MAX(id) FROM customers));
SELECT setval('products_id_seq',   (SELECT MAX(id) FROM products));
SELECT setval('orders_id_seq',     (SELECT MAX(id) FROM orders));
SELECT setval('order_items_id_seq',(SELECT MAX(id) FROM order_items));
SELECT setval('payments_id_seq',   (SELECT MAX(id) FROM payments));
