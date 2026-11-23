// Starts an isolated temporary PostgreSQL cluster and verifies the branch
// migration's RLS, tenant boundaries, movement retry behavior, and locking.
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer } from "node:net"
import { fileURLToPath } from "node:url"

const root = new URL("../", import.meta.url)
const adminA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const sellerA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const shopA = "11111111-1111-4111-8111-111111111111"
const shopB = "22222222-2222-4222-8222-222222222222"
const productA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const productRace = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const productWrongBranch = "ffffffff-ffff-4fff-8fff-ffffffffffff"
const productForeignBusiness = "99999999-9999-4999-8999-999999999998"
const productAtDestination = "11111111-aaaa-4aaa-8aaa-111111111111"
const transferRequest = "99999999-9999-4999-8999-999999999991"
const productPartialA = "12121212-1212-4121-8121-121212121201"
const productPartialB = "12121212-1212-4121-8121-121212121202"
const productCancelA = "12121212-1212-4121-8121-121212121203"
const productCancelB = "12121212-1212-4121-8121-121212121204"
const productPartialCancelA = "12121212-1212-4121-8121-121212121205"
const productPartialCancelB = "12121212-1212-4121-8121-121212121206"
const productReceiptRaceA = "12121212-1212-4121-8121-121212121207"
const productReceiptRaceB = "12121212-1212-4121-8121-121212121208"

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      env: { ...globalThis.process.env, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    process.stdout.on("data", (chunk) => (stdout += chunk))
    process.stderr.on("data", (chunk) => (stderr += chunk))
    process.on("error", reject)
    process.on("close", (code) =>
      resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }),
    )
    if (options.input) process.stdin.end(options.input)
    else process.stdin.end()
  })
}

async function getFreePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

const directory = await mkdtemp(join(tmpdir(), "aura-branch-db-"))
const dataDir = join(directory, "data")
const logFile = join(directory, "postgres.log")
const port = await getFreePort()
const psqlArgs = [
  "-X",
  "-qAt",
  "-v",
  "ON_ERROR_STOP=1",
  "-h",
  "127.0.0.1",
  "-p",
  String(port),
  "-U",
  "postgres",
  "-d",
  "postgres",
]

async function psql(args = [], input) {
  const result = await run("psql", [...psqlArgs, ...args], { input })
  assert.equal(result.code, 0, result.stderr)
  return result.stdout
}

async function scopedSql(userId, sql) {
  return psql(
    [],
    `SET ROLE authenticated;
     SELECT set_config('request.jwt.claim.sub', '${userId}', false);
     ${sql}`,
  )
}

async function scopedFailure(userId, sql, messagePattern) {
  const result = await run("psql", psqlArgs, {
    input: `SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${userId}', false);
      ${sql}`,
  })
  assert.notEqual(result.code, 0, "expected the scoped operation to fail")
  assert.match(result.stderr, messagePattern)
}

let serverStarted = false
try {
  let result = await run("initdb", ["-D", dataDir, "--auth=trust", "--username=postgres", "--no-instructions"])
  assert.equal(result.code, 0, result.stderr)
  result = await run("pg_ctl", [
    "-D",
    dataDir,
    "-l",
    logFile,
    "-o",
    `-h 127.0.0.1 -p ${port} -k ${directory}`,
    "-w",
    "start",
  ])
  assert.equal(result.code, 0, result.stderr)
  serverStarted = true

  await psql(["-f", fileURLToPath(new URL("tests/branch-access-fixture.sql", root))])
  await psql(["-f", fileURLToPath(new URL("supabase/migrations/021_branch_access_and_transfers.sql", root))])
  await psql(["-f", fileURLToPath(new URL("supabase/migrations/022_branch_aware_products_and_sales.sql", root))])
  await psql(["-f", fileURLToPath(new URL("supabase/migrations/023_branch_transfer_partial_receipt_and_cancel.sql", root))])
  await psql(["-f", fileURLToPath(new URL("supabase/migrations/024_branch_transfer_scan_access.sql", root))])

  const preserved = await psql([], `
    SELECT count(*) || ':' || count(*) FILTER (WHERE current_location_shop_id = shop_id)
    FROM public.products;
  `)
  assert.equal(preserved, "4:4", "legacy product rows and QR locations must be preserved")
  await psql([], `
    INSERT INTO public.products (
      id, shop_id, business_id, current_location_shop_id, created_by, name, sku
    ) VALUES
      ('${productPartialA}', '${shopA}', '${shopA}', '${shopA}', '${adminA}', 'Partial A', 'AA1001'),
      ('${productPartialB}', '${shopA}', '${shopA}', '${shopA}', '${adminA}', 'Partial B', 'AA1002'),
      ('${productCancelA}', '${shopA}', '${shopA}', '${shopA}', '${adminA}', 'Cancel A', 'AA1003'),
      ('${productCancelB}', '${shopA}', '${shopA}', '${shopA}', '${adminA}', 'Cancel B', 'AA1004'),
      ('${productPartialCancelA}', '${shopA}', '${shopA}', '${shopA}', '${adminA}', 'Partial cancel A', 'AA1005'),
      ('${productPartialCancelB}', '${shopA}', '${shopA}', '${shopA}', '${adminA}', 'Partial cancel B', 'AA1006'),
      ('${productReceiptRaceA}', '${shopA}', '${shopA}', '${shopA}', '${adminA}', 'Receipt race A', 'AA1007'),
      ('${productReceiptRaceB}', '${shopA}', '${shopA}', '${shopA}', '${adminA}', 'Receipt race B', 'AA1008');
  `)

  const branchOutput = await scopedSql(
    adminA,
    `SELECT public.create_business_branch('${shopA}', 'Второй филиал');`,
  )
  const branch2 = branchOutput.split(/\r?\n/).at(-1)
  assert.match(branch2, /^[0-9a-f-]{36}$/i)
  await psql([], `UPDATE public.shop_settings SET seq_id = 2 WHERE shop_id = '${branch2}';`)
  await scopedSql(
    adminA,
    `SELECT public.grant_branch_access('${sellerA}', '${branch2}');`,
  )
  const sourceScanMatch = await scopedSql(
    adminA,
    `SELECT public.set_active_shop('${shopA}');
     SELECT product_id || ':' || sku || ':' || product_name || ':' || item_status
     FROM public.resolve_branch_transfer_scan('AA1001', 1, NULL);`,
  )
  assert.equal(
    sourceScanMatch.split(/\r?\n/).at(-1),
    `${productPartialA}:AA1001:Partial A:source_stock`,
  )
  const wrongSourceQr = await scopedSql(
    adminA,
    `SELECT count(*) FROM public.resolve_branch_transfer_scan('AA1001', 2, NULL);`,
  )
  assert.equal(wrongSourceQr.split(/\r?\n/).at(-1), "0", "a QR from another branch cannot resolve source stock")

  const accessChecks = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.current_shop_id();
     SELECT count(*) FROM public.shop_settings;
     SELECT public.has_branch_access('${shopB}');`,
  )
  assert.match(accessChecks, new RegExp(`${branch2}[\\s\\S]*${branch2}[\\s\\S]*2[\\s\\S]*f$`))

  const createdInActiveBranch = await scopedSql(
    sellerA,
    `INSERT INTO public.products (
       id, shop_id, business_id, current_location_shop_id, created_by, name
     ) VALUES (
       '${productAtDestination}', '${branch2}', '${shopA}', '${branch2}', '${sellerA}', 'New branch item'
     );
     SELECT count(*) FROM public.products WHERE id = '${productAtDestination}';`,
  )
  assert.equal(createdInActiveBranch.split(/\r?\n/).at(-1), "1")

  const wrongBranchSale = await scopedSql(
    sellerA,
    `SELECT public.commit_offline_sale(
       'wrong-branch',
       '{"items":[{"product_id":"${productWrongBranch}","quantity":1,"price":100}]}'
     );`,
  )
  assert.equal(JSON.parse(wrongBranchSale.split(/\r?\n/).at(-1)).code, "wrong_branch")

  const foreignBusinessSale = await scopedSql(
    sellerA,
    `SELECT public.commit_offline_sale(
       'foreign-business',
       '{"items":[{"product_id":"${productForeignBusiness}","quantity":1,"price":100}]}'
     );`,
  )
  assert.equal(JSON.parse(foreignBusinessSale.split(/\r?\n/).at(-1)).code, "foreign_business")

  const denied = await scopedSql(
    sellerA,
    `DO $$
     BEGIN
       PERFORM public.set_active_shop('${shopB}');
       RAISE EXCEPTION 'unexpected branch access';
     EXCEPTION WHEN insufficient_privilege THEN
       NULL;
     END;
     $$;
     SELECT 'denied';`,
  )
  assert.equal(denied.split(/\r?\n/).at(-1), "denied")

  const crossBusiness = await scopedSql(
    adminA,
    `DO $$
     BEGIN
       PERFORM public.grant_branch_access('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '${shopB}');
       RAISE EXCEPTION 'unexpected cross-business membership';
     EXCEPTION WHEN insufficient_privilege THEN
       NULL;
     END;
     $$;
     SELECT 'isolated';`,
  )
  assert.equal(crossBusiness.split(/\r?\n/).at(-1), "isolated")

  const startTransfer = `SELECT public.set_active_shop('${shopA}');
     SELECT public.begin_branch_transfer(
       '${transferRequest}', '${branch2}', ARRAY['${productA}'::uuid]
     );`
  const created = await scopedSql(sellerA, startTransfer)
  const transferId = created.split(/\r?\n/).at(-1)
  assert.match(transferId, /^[0-9a-f-]{36}$/i)
  const retried = await scopedSql(sellerA, startTransfer)
  assert.equal(retried.split(/\r?\n/).at(-1), transferId, "same request must return the original transfer")

  const notReceivedSale = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.commit_offline_sale(
       'not-received',
       '{"items":[{"product_id":"${productA}","quantity":1,"price":100}]}'
     );`,
  )
  assert.equal(JSON.parse(notReceivedSale.split(/\r?\n/).at(-1)).code, "awaiting_receipt")

  const transitState = await psql([], `
    SELECT t.status || ':' || i.status || ':' ||
           (p.current_location_shop_id = '${shopA}'::uuid)::text || ':' ||
           (p.shop_id = '${shopA}'::uuid)::text
    FROM public.branch_transfers AS t
    JOIN public.branch_transfer_items AS i ON i.transfer_id = t.id
    JOIN public.products AS p ON p.id = i.product_id
    WHERE t.id = '${transferId}';
  `)
  assert.equal(transitState, "in_transit:in_transit:true:true")
  const guardSnapshot = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${shopA}');
     SELECT public.current_shop_id() || ':' ||
            coalesce(current_setting('app.branch_transfer_operation', true), 'NULL') || ':' ||
            (SELECT count(*) FROM public.branch_transfer_items
             WHERE product_id = '${productA}' AND status = 'in_transit');`,
  )
  assert.match(guardSnapshot, new RegExp(`${shopA}:NULL:1$`))

  const blockedSale = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${shopA}');
     DO $$
     BEGIN
       UPDATE public.products SET status = 'sold' WHERE id = '${productA}';
       RAISE EXCEPTION 'unexpected sale during transfer';
     EXCEPTION WHEN check_violation THEN
       NULL;
     END;
     $$;
     SELECT 'sale-blocked';`,
  )
  assert.equal(blockedSale.split(/\r?\n/).at(-1), "sale-blocked")

  await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.receive_branch_transfer('${transferId}');
     SELECT public.receive_branch_transfer('${transferId}');`,
  )
  const receivedState = await psql([], `
    SELECT t.status || ':' || i.status || ':' ||
           (p.current_location_shop_id = '${branch2}'::uuid)::text || ':' ||
           (p.shop_id = '${shopA}'::uuid)::text || ':' ||
           (SELECT count(*) FROM public.branch_transfer_audit WHERE transfer_id = t.id)
    FROM public.branch_transfers AS t
    JOIN public.branch_transfer_items AS i ON i.transfer_id = t.id
    JOIN public.products AS p ON p.id = i.product_id
    WHERE t.id = '${transferId}';
  `)
  assert.equal(receivedState, "received:received:true:true:2")

  const acceptedOldQrSale = await scopedSql(
    sellerA,
    `SELECT public.commit_offline_sale(
       'received-old-qr',
       '{"items":[{"product_id":"${productA}","quantity":1,"price":100}]}'
     );`,
  )
  const acceptedResult = JSON.parse(acceptedOldQrSale.split(/\r?\n/).at(-1))
  assert.equal(acceptedResult.accepted, true, "received product can be sold by its original product ID")
  const soldState = await psql([], `
    SELECT p.shop_id || ':' || p.current_location_shop_id || ':' || p.status || ':' || s.shop_id
    FROM public.products AS p
    JOIN public.sales AS s ON s.product_id = p.id
    WHERE p.id = '${productA}';
  `)
  assert.equal(soldState, `${shopA}:${branch2}:sold:${branch2}`, "sale keeps QR source and uses active branch")

  const partialTransferOutput = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${shopA}');
     SELECT public.begin_branch_transfer(
       '99999999-9999-4999-8999-999999999901',
       '${branch2}',
       ARRAY['${productPartialA}'::uuid, '${productPartialB}'::uuid]
     );`,
  )
  const partialTransferId = partialTransferOutput.split(/\r?\n/).at(-1)
  const partialReceiptRequest = "99999999-9999-4999-8999-999999999902"
  const partialTransferDetailsOutput = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.get_branch_transfer_details('${partialTransferId}');`,
  )
  const partialTransferDetails = JSON.parse(partialTransferDetailsOutput.split(/\r?\n/).at(-1))
  assert.equal(partialTransferDetails.source_shop_name, "Аура")
  assert.equal(partialTransferDetails.destination_shop_name, "Второй филиал")
  assert.equal(partialTransferDetails.items.length, 2)
  assert.equal(partialTransferDetails.items[0].qr_shop_seq_id, 1)
  const inboundScanMatch = await scopedSql(
    sellerA,
    `SELECT product_id || ':' || sku || ':' || product_name || ':' || item_status
     FROM public.resolve_branch_transfer_scan('AA1001', 1, '${partialTransferId}');`,
  )
  assert.equal(
    inboundScanMatch.split(/\r?\n/).at(-1),
    `${productPartialA}:AA1001:Partial A:in_transit`,
  )
  const wrongInboundScan = await scopedSql(
    sellerA,
    `SELECT count(*) FROM public.resolve_branch_transfer_scan('AA1001', 2, '${partialTransferId}');`,
  )
  assert.equal(wrongInboundScan.split(/\r?\n/).at(-1), "0")
  await scopedFailure(
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    `SELECT public.get_branch_transfer_details('${partialTransferId}');`,
    /Нет доступа к этому перемещению/,
  )

  await scopedFailure(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.receive_branch_transfer_items(
       '${partialTransferId}', ARRAY['${productPartialA}'::uuid],
       '99999999-9999-4999-8999-999999999903', NULL
     );`,
    /Для частичной приёмки укажите причину расхождения/,
  )
  await scopedFailure(
    "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    `SELECT public.receive_branch_transfer_items(
       '${partialTransferId}', ARRAY['${productPartialA}'::uuid],
       '99999999-9999-4999-8999-999999999904', 'Не мой филиал'
     );`,
    /Нет доступа к филиалу-получателю/,
  )

  const partialReceipt = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.receive_branch_transfer_items(
       '${partialTransferId}', ARRAY['${productPartialA}'::uuid],
       '${partialReceiptRequest}', 'Не все позиции прибыли'
     );
     SELECT public.receive_branch_transfer_items(
       '${partialTransferId}', ARRAY['${productPartialA}'::uuid],
       '${partialReceiptRequest}', 'Не все позиции прибыли'
     );`,
  )
  assert.equal(partialReceipt.split(/\r?\n/).at(-1), partialTransferId, "repeated partial receipt returns the same transfer")
  const partialState = await psql([], `
    SELECT t.status || ':' ||
           count(*) FILTER (WHERE i.status = 'received') || ':' ||
           count(*) FILTER (WHERE i.status = 'in_transit') || ':' ||
           count(*) FILTER (WHERE i.status = 'cancelled') || ':' ||
           count(*) FILTER (WHERE i.status = 'received' AND p.current_location_shop_id = '${branch2}'::uuid) || ':' ||
           count(*) FILTER (WHERE i.status = 'in_transit' AND p.current_location_shop_id = '${shopA}'::uuid) || ':' ||
           (SELECT count(*) FROM public.branch_transfer_audit WHERE transfer_id = t.id)
    FROM public.branch_transfers AS t
    JOIN public.branch_transfer_items AS i ON i.transfer_id = t.id
    JOIN public.products AS p ON p.id = i.product_id
    WHERE t.id = '${partialTransferId}'
    GROUP BY t.id;
  `)
  assert.equal(partialState, "partially_received:1:1:0:1:1:2")
  const saleAfterPartialReceipt = await scopedSql(
    sellerA,
    `SELECT public.commit_offline_sale(
       'partial-receipt-sale',
       '{"items":[{"product_id":"${productPartialA}","quantity":1,"price":100}]}'
     );`,
  )
  assert.equal(
    JSON.parse(saleAfterPartialReceipt.split(/\r?\n/).at(-1)).accepted,
    true,
    "an individually received item is sellable before its transfer is complete",
  )
  await scopedFailure(
    sellerA,
    `SELECT public.receive_branch_transfer_items(
       '${partialTransferId}',
       ARRAY['${productPartialA}'::uuid, '${productPartialB}'::uuid],
       '${partialReceiptRequest}', 'Изменённый запрос'
     );`,
    /Ключ запроса уже использован для другого действия/,
  )
  await scopedFailure(
    sellerA,
    `SELECT public.receive_branch_transfer_items(
       '${partialTransferId}', ARRAY['${productWrongBranch}'::uuid],
       '99999999-9999-4999-8999-999999999905', 'Не относится к перемещению'
     );`,
    /не входит в это перемещение или уже обработан/,
  )

  await scopedSql(
    sellerA,
    `SELECT public.receive_branch_transfer('${partialTransferId}');
     SELECT public.receive_branch_transfer('${partialTransferId}');`,
  )
  const completedPartial = await psql([], `
    SELECT t.status || ':' ||
           count(*) FILTER (WHERE i.status = 'received') || ':' ||
           count(*) FILTER (WHERE i.status = 'in_transit') || ':' ||
           (SELECT count(*) FROM public.branch_transfer_audit WHERE transfer_id = t.id)
    FROM public.branch_transfers AS t
    JOIN public.branch_transfer_items AS i ON i.transfer_id = t.id
    WHERE t.id = '${partialTransferId}'
    GROUP BY t.id;
  `)
  assert.equal(completedPartial, "received:2:0:3", "legacy full-receipt RPC completes the outstanding items")

  const cancelTransferOutput = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${shopA}');
     SELECT public.begin_branch_transfer(
       '99999999-9999-4999-8999-999999999906',
       '${branch2}',
       ARRAY['${productCancelA}'::uuid, '${productCancelB}'::uuid]
     );`,
  )
  const cancelTransferId = cancelTransferOutput.split(/\r?\n/).at(-1)
  const cancelFirstRequest = "99999999-9999-4999-8999-999999999907"
  await scopedSql(
    sellerA,
    `SELECT public.cancel_branch_transfer(
       '${cancelTransferId}', ARRAY['${productCancelA}'::uuid],
       '${cancelFirstRequest}', 'Товар физически вернули отправителю'
     );
     SELECT public.cancel_branch_transfer(
       '${cancelTransferId}', ARRAY['${productCancelA}'::uuid],
       '${cancelFirstRequest}', 'Товар физически вернули отправителю'
     );`,
  )
  const partlyCancelled = await psql([], `
    SELECT t.status || ':' ||
           count(*) FILTER (WHERE i.status = 'received') || ':' ||
           count(*) FILTER (WHERE i.status = 'in_transit') || ':' ||
           count(*) FILTER (WHERE i.status = 'cancelled') || ':' ||
           count(*) FILTER (WHERE i.status = 'cancelled' AND p.current_location_shop_id = '${shopA}'::uuid) || ':' ||
           (SELECT count(*) FROM public.branch_transfer_audit WHERE transfer_id = t.id)
    FROM public.branch_transfers AS t
    JOIN public.branch_transfer_items AS i ON i.transfer_id = t.id
    JOIN public.products AS p ON p.id = i.product_id
    WHERE t.id = '${cancelTransferId}'
    GROUP BY t.id;
  `)
  assert.equal(partlyCancelled, "partially_cancelled:0:1:1:1:2")

  await scopedFailure(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.cancel_branch_transfer(
       '${cancelTransferId}', ARRAY['${productCancelB}'::uuid],
       '99999999-9999-4999-8999-999999999908', 'Не тот филиал'
     );`,
    /Нет доступа к филиалу-отправителю/,
  )
  await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${shopA}');
     SELECT public.cancel_branch_transfer(
       '${cancelTransferId}', ARRAY['${productCancelB}'::uuid],
       '99999999-9999-4999-8999-999999999909', 'Возврат подтверждён сканированием'
     );`,
  )
  const cancelledState = await psql([], `
    SELECT t.status || ':' ||
           count(*) FILTER (WHERE i.status = 'received') || ':' ||
           count(*) FILTER (WHERE i.status = 'in_transit') || ':' ||
           count(*) FILTER (WHERE i.status = 'cancelled') || ':' ||
           (SELECT count(*) FROM public.branch_transfer_audit WHERE transfer_id = t.id)
    FROM public.branch_transfers AS t
    JOIN public.branch_transfer_items AS i ON i.transfer_id = t.id
    WHERE t.id = '${cancelTransferId}'
    GROUP BY t.id;
  `)
  assert.equal(cancelledState, "cancelled:0:0:2:3")
  const saleAfterReturn = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${shopA}');
     SELECT public.commit_offline_sale(
       'cancelled-item-returned',
       '{"items":[{"product_id":"${productCancelA}","quantity":1,"price":100}]}'
     );`,
  )
  assert.equal(
    JSON.parse(saleAfterReturn.split(/\r?\n/).at(-1)).accepted,
    true,
    "a cancelled item confirmed returned to the source is available there again",
  )

  const partialCancelTransferOutput = await scopedSql(
    sellerA,
    `SELECT public.begin_branch_transfer(
       '99999999-9999-4999-8999-999999999910',
       '${branch2}',
       ARRAY['${productPartialCancelA}'::uuid, '${productPartialCancelB}'::uuid]
     );`,
  )
  const partialCancelTransferId = partialCancelTransferOutput.split(/\r?\n/).at(-1)
  await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.receive_branch_transfer_items(
       '${partialCancelTransferId}', ARRAY['${productPartialCancelA}'::uuid],
       '99999999-9999-4999-8999-999999999911', 'Получена только одна позиция'
     );`,
  )
  await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${shopA}');
     SELECT public.cancel_branch_transfer(
       '${partialCancelTransferId}', ARRAY['${productPartialCancelB}'::uuid],
       '99999999-9999-4999-8999-999999999912', 'Остаток физически вернули отправителю'
     );`,
  )
  const partialReceiveCancelState = await psql([], `
    SELECT t.status || ':' ||
           count(*) FILTER (WHERE i.status = 'received' AND p.current_location_shop_id = '${branch2}'::uuid) || ':' ||
           count(*) FILTER (WHERE i.status = 'cancelled' AND p.current_location_shop_id = '${shopA}'::uuid) || ':' ||
           (SELECT count(*) FROM public.branch_transfer_audit WHERE transfer_id = t.id)
    FROM public.branch_transfers AS t
    JOIN public.branch_transfer_items AS i ON i.transfer_id = t.id
    JOIN public.products AS p ON p.id = i.product_id
    WHERE t.id = '${partialCancelTransferId}'
    GROUP BY t.id;
  `)
  assert.equal(
    partialReceiveCancelState,
    "partially_cancelled:1:1:3",
    "a partially received transfer cancels only scanned, unreceived returns",
  )
  const saleAfterPartialCancel = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${branch2}');
     SELECT public.commit_offline_sale(
       'partial-cancel-received-sale',
       '{"items":[{"product_id":"${productPartialCancelA}","quantity":1,"price":100}]}'
     );`,
  )
  assert.equal(
    JSON.parse(saleAfterPartialCancel.split(/\r?\n/).at(-1)).accepted,
    true,
    "a received item remains sellable when another item in the transfer is cancelled",
  )

  const receiptRaceTransferOutput = await scopedSql(
    sellerA,
    `SELECT public.set_active_shop('${shopA}');
     SELECT public.begin_branch_transfer(
       '99999999-9999-4999-8999-999999999913',
       '${branch2}',
       ARRAY['${productReceiptRaceA}'::uuid, '${productReceiptRaceB}'::uuid]
     );`,
  )
  const receiptRaceTransferId = receiptRaceTransferOutput.split(/\r?\n/).at(-1)
  await scopedSql(sellerA, `SELECT public.set_active_shop('${branch2}');`)
  const startReceiptRace = (productId, requestId) =>
    run("psql", psqlArgs, {
      input: `BEGIN;
        SET ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${sellerA}', false);
        SELECT public.receive_branch_transfer_items(
          '${receiptRaceTransferId}', ARRAY['${productId}'::uuid],
          '${requestId}', 'Параллельная приёмка позиции'
        );
        SELECT pg_sleep(0.25);
        COMMIT;`,
    })
  const receiptRaceResults = await Promise.all([
    startReceiptRace(productReceiptRaceA, "99999999-9999-4999-8999-999999999914"),
    startReceiptRace(productReceiptRaceB, "99999999-9999-4999-8999-999999999915"),
  ])
  assert.equal(receiptRaceResults.filter((item) => item.code === 0).length, 2)
  const receiptRaceState = await psql([], `
    SELECT t.status || ':' ||
           count(*) FILTER (WHERE i.status = 'received') || ':' ||
           count(*) FILTER (WHERE i.status = 'in_transit') || ':' ||
           (SELECT count(*) FROM public.branch_transfer_audit WHERE transfer_id = t.id)
    FROM public.branch_transfers AS t
    JOIN public.branch_transfer_items AS i ON i.transfer_id = t.id
    WHERE t.id = '${receiptRaceTransferId}'
    GROUP BY t.id;
  `)
  assert.equal(receiptRaceState, "received:2:0:3", "concurrent partial receipts serialize without losing items")

  const startRace = (requestId) =>
    run("psql", psqlArgs, {
      input: `BEGIN;
        SET ROLE authenticated;
        SELECT set_config('request.jwt.claim.sub', '${adminA}', false);
        SELECT public.begin_branch_transfer(
          '${requestId}', '${branch2}', ARRAY['${productRace}'::uuid]
        );
        SELECT pg_sleep(0.5);
        COMMIT;`,
    })
  const firstRace = startRace("99999999-9999-4999-8999-999999999992")
  await new Promise((resolve) => setTimeout(resolve, 100))
  const secondRace = startRace("99999999-9999-4999-8999-999999999993")
  const raceResults = await Promise.all([firstRace, secondRace])
  assert.equal(raceResults.filter((item) => item.code === 0).length, 1)
  assert.match(
    raceResults.find((item) => item.code !== 0).stderr,
    /duplicate key value violates unique constraint|branch_transfer_items_one_active_transfer_idx/,
  )

  console.log("PASS: branch RLS, product locations, partial/full receipt, retries, scanned cancellation, audit, tenant isolation, and concurrent transfers")
} finally {
  if (serverStarted) {
    await run("pg_ctl", ["-D", dataDir, "-m", "immediate", "-w", "stop"])
  }
  await rm(directory, { recursive: true, force: true })
}
