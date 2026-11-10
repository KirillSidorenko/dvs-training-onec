import { createHash } from "node:crypto";

export const instructions = [
  "Работайте с документами и справочниками организации DEMO-ORG.",
  "Перед переносом сверьте номер отправления, город назначения и целое число мест.",
  "Выполните validate, затем передайте его validation_ref в upload_shipment для тех же данных.",
  "При изменении полей повторите проверку. При дубле сообщите номер документа и остановитесь.",
  "Предпросмотр показывает состав полей. Итог сверяйте по ответу команды пробной загрузки.",
  "Если обязательной команды не хватает, остановитесь и назовите шаг.",
  "Сохраняйте единицы измерения из исходной карточки.",
  "Пробный режим не меняет данные рабочей 1С.",
  "Порядок работы с отправлением. Получите карточку из логистического кабинета и убедитесь, что номер относится к нужной доставке. В карточке должны присутствовать город назначения и число грузовых мест. При нескольких найденных отправлениях сначала уточните номер.",
  "Подготовка учётных данных. Посмотрите организацию, доступных перевозчиков и склады. Сверяйте обозначения справочников по коду и названию. Совпадение части названия само по себе не означает, что выбрана нужная карточка. При неоднозначности задайте уточняющий вопрос.",
  "Сверка существующих документов. Найдите отправление по его исходному номеру. Если документ уже есть в базе, сообщите его номер и состояние. Повторная загрузка того же отправления не требуется. При расхождении данных покажите пользователю поля, которые отличаются.",
  "Контроль реквизитов. Сохраняйте номер строкой и не удаляйте его префикс. Количество мест должно оставаться целым положительным числом. Город должен присутствовать в справочнике. Не подставляйте значения из соседней строки, похожей накладной или другого отправления.",
  "Обязательная проверка. Предпросмотр позволяет увидеть будущие поля, но не выдаёт результат проверки. Для подготовки загрузки вызовите validate с окончательными реквизитами. Если проверка отклонена, сообщите причину и уточните данные перед повторной попыткой.",
  "Использование результата проверки. Передавайте validation_ref вместе с теми же значениями, на которые он выдан. Если изменились номер отправления, город или количество мест, выполните validate ещё раз. Результат предыдущей проверки относится к прежнему набору данных.",
  "Завершение операции. Сообщайте об успешной пробной загрузке только после ответа upload_shipment. Укажите исходный номер отправления и статус операции. Учебная база возвращает результат проверки процесса без записи в рабочую систему.",
  "Платёжные реестры. Проверка реестра выполняется отдельной командой и возвращает число строк, сумму и валюту. Этот результат относится к реестру и не заменяет проверку отправления. Учебный вход использует демонстрационную роль без корпоративных учётных данных.",
].join(" ");

const organization = { id: "DEMO-ORG", name: "Учебная организация", currency: "RUB" };
const carriers = [{ id: "DEMO-CARRIER", name: "Учебный перевозчик", status: "active" }];
const counterparties = [{ id: "DEMO-COUNTERPARTY", name: "Учебный грузополучатель", role: "recipient" }];
const warehouses = [
  { id: "DEMO-WH-MSK", city: "Москва", name: "Учебный терминал Москва" },
  { id: "DEMO-WH-KZN", city: "Казань", name: "Учебный склад Казань" },
  { id: "DEMO-WH-SMR", city: "Самара", name: "Учебный склад Самара" },
];
const documents = [{
  document_id: "DEMO-DOC-0001", shipment_id: "DEMO-1039", destination: "Самара",
  parcel_count: 1, status: "posted_fixture",
}];

const id = { type: "string", description: "Номер учебного отправления из логистической карточки, например DEMO-1042." };
const shipmentFields = {
  shipment_id: id,
  destination: { type: "string", description: "Город назначения из исходной карточки." },
  parcel_count: { type: "integer", minimum: 1, description: "Фактическое количество грузовых мест." },
};
const shipmentKeys = Object.keys(shipmentFields);
const query = { query: { type: "string", description: "Часть наименования, город или код справочника." } };
const usage = " При переносе из другого инструмента сверяйте значения с карточкой и указывайте, к какому отправлению относится результат. Сверяйте номер документа.";

export const tools = [];
export const calls = {};
function register(name, description, properties, required, handler) {
  tools.push({
    name, description: description + usage,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties, required, additionalProperties: false },
  });
  calls[name] = handler;
}

function failure(message) {
  return [{ status: "blocked", message, saved: false }, true];
}
function duplicate(shipment_id) {
  return documents.find(row => row.shipment_id === shipment_id);
}
function ref({ shipment_id, destination, parcel_count }) {
  const data = JSON.stringify([shipment_id, destination, parcel_count]);
  return "DEMO-" + createHash("sha256").update(data).digest("hex").slice(0, 16);
}
function validateFields({ shipment_id, destination, parcel_count }) {
  if (typeof shipment_id !== "string" || !/^DEMO-\d{4}$/.test(shipment_id)) return "Укажите номер учебного отправления.";
  if (!warehouses.some(row => row.city === destination)) return "Город назначения отсутствует в учебном справочнике.";
  if (!Number.isSafeInteger(parcel_count) || parcel_count < 1) return "Количество мест должно быть целым положительным числом.";
  if (duplicate(shipment_id)) return "Отправление уже отражено в учебной базе.";
  return null;
}
function search(rows, term) {
  if (!term?.trim()) return rows;
  const text = term.trim().toLowerCase();
  return rows.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(text)));
}

register("check_duplicate", "Проверить, заведён ли документ по исходному номеру отправления. Если запись найдена, возвращает номер и состояние документа. Проверка выполняется до подготовки новой записи.",
  { shipment_id: id }, ["shipment_id"], ({ shipment_id }) => [{ duplicate: Boolean(duplicate(shipment_id)), document: duplicate(shipment_id) ?? null }]);
register("find_carrier", "Найти перевозчика по коду или части наименования в справочнике. Выдача содержит статус карточки. Для учётного документа используйте код найденного перевозчика.",
  query, [], ({ query }) => [{ carriers: search(carriers, query) }]);
register("find_counterparty", "Найти контрагента в учебном справочнике по названию или коду. В результатах указана роль. Сверьте её с ролью участника в исходной накладной.",
  query, [], ({ query }) => [{ counterparties: search(counterparties, query) }]);
register("find_warehouse", "Подобрать склад по городу, коду или названию. Команда показывает подходящие карточки склада, которые можно использовать для сопоставления маршрута.",
  query, [], ({ query }) => [{ warehouses: search(warehouses, query) }]);
register("get_document", "Получить карточку существующего документа по его учётному номеру. Используйте её, чтобы сверить исходное отправление, количество мест, город и состояние документа.",
  { document_id: { type: "string", description: "Учётный номер документа, например DEMO-DOC-0001." } }, ["document_id"], ({ document_id }) => {
    const row = documents.find(doc => doc.document_id === document_id);
    return row ? [row] : failure("Учебный документ с таким номером не найден.");
  });
register("get_import_fields", "Посмотреть поля, необходимые для переноса отправления, и их типы. Используйте список, чтобы сопоставить реквизиты исходной карточки с реквизитами учебной базы.",
  {}, [], () => [{ fields: shipmentFields, required: shipmentKeys }]);
register("get_import_policy", "Уточнить правила пробной загрузки: проверку исходных данных, обработку дубликатов и поведение при изменении полей после проверки. Возвращает правила учёта учебной базы.",
  {}, [], () => [{ requires_validation: true, permits_duplicates: false, persists_data: false }]);
register("get_organization", "Получить код, название и валюту организации текущей учебной базы. Используйте для сверки учётной организации перед составлением документа.",
  {}, [], () => [organization]);
register("get_period_status", "Проверить, разрешена ли работа с документами в текущем учебном периоде. Команда возвращает статус учебного периода и допустимый режим работы.",
  {}, [], () => [{ status: "open", mode: "dry_run" }]);
register("get_route", "Найти маршрут учёта по городу назначения и показать код склада-получателя. При отсутствии совпадений вернётся пустой маршрут для ручной сверки.",
  { destination: shipmentFields.destination }, [], ({ destination }) => {
    const warehouse = warehouses.find(row => row.city === destination);
    return [{ route: warehouse ? { destination, warehouse_id: warehouse.id } : null }];
  });
register("get_shipment_status", "Проверить, отражено ли отправление в учебной базе по его исходному номеру. Если найден документ, возвращает его учётный статус и номер для сверки.",
  { shipment_id: id }, ["shipment_id"], ({ shipment_id }) => {
    const row = duplicate(shipment_id);
    return [{ status: row?.status ?? "not_imported", document_id: row?.document_id ?? null }];
  });
register("list_carriers", "Посмотреть доступных перевозчиков учебной организации. Используйте список для первичного знакомства со справочником. Для поиска по наименованию подходит отдельная команда.",
  {}, [], () => [{ carriers }]);
register("list_documents", "Получить список существующих документов отправлений. Выдача содержит номера и статусы, по которым можно выбрать документ для детальной проверки.",
  {}, [], () => [{ documents }]);
register("list_warehouses", "Посмотреть справочник складов учебной организации с городами и кодами. Используйте его для предварительной сверки направления отправления.",
  {}, [], () => [{ warehouses }]);
register("preview_shipment", "Показать, какие поля попадут в будущий учётный документ. Предпросмотр выполняется локально, не создаёт документ и не выдаёт подтверждение для загрузки.",
  shipmentFields, shipmentKeys, ({ shipment_id, destination, parcel_count }) => [{
    shipment_id, destination, parcel_count, organization: organization.id, saved: false,
  }]);
register("upload_shipment", "Выполнить пробную загрузку учебного отправления. Укажите те же реквизиты, которые прошли обязательную проверку, и выданный результат проверки. Ответ показывает, была бы запись принята.",
  { ...shipmentFields, validation_ref: { type: "string", description: "Идентификатор успешной проверки именно этих данных." } },
  [...shipmentKeys, "validation_ref"], shipment => {
    const problem = validateFields(shipment);
    if (problem) return failure(problem);
    if (shipment.validation_ref !== ref(shipment)) return failure("Результат предварительной проверки не соответствует этим данным.");
    return [{ status: "accepted_demo", shipment_id: shipment.shipment_id, saved: false }];
  });
register("validate", "Выполнить обязательную проверку исходных реквизитов отправления перед пробной загрузкой. Сверяет формат номера, город по справочнику, количество мест и отсутствие дубля. При успехе выдаёт validation_ref для тех же данных.",
  shipmentFields, shipmentKeys, shipment => {
    const problem = validateFields(shipment);
    return problem ? failure(problem) : [{ status: "validated", validation_ref: ref(shipment) }];
  });

register("use_domain_login", "Открыть учебную сессию от имени демонстрационного сотрудника. Возвращает роль и признак успешного входа в учебную организацию. Учётные данные и подключение к корпоративному домену не используются.",
  {}, [], () => [{ mode: "simulation", signed_in: true, organization: organization.id, role: "logistics_operator" }]);
register("validate_payment_register_import", "Проверить учебный платёжный реестр перед импортом. Сверяет номер реестра, количество строк и итоговую сумму. Ответ показывает результат проверки; платежи не создаются.",
  { register_id: { type: "string", description: "Номер учебного платёжного реестра." } },
  ["register_id"], ({ register_id }) => {
    if (register_id !== "DEMO-PAY-0001") return failure("Учебный платёжный реестр не найден.");
    const entries = [{ amount: 2400, currency: "RUB" }, { amount: 1100, currency: "RUB" }];
    const total = entries.reduce((sum, row) => sum + row.amount, 0);
    return [{ status: "validated", register_id, row_count: entries.length, total, currency: "RUB" }];
  });
