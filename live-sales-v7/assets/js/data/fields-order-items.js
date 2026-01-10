// Pola pozycji w zamówieniu (produkty w koszyku)
// Bazowane na getOrders.products[] endpoint

const ORDER_ITEM_FIELDS = {
    // 1. ORDER ITEM (podstawowe dane pozycji)
    'ORDER_ITEM': [
        { field_key: 'storage', label: 'Typ magazynu', group: 'ORDER_ITEM', higher_plan: false, description: 'bl, shop, warehouse' },
        { field_key: 'storage_id', label: 'ID magazynu', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'order_product_id', label: 'ID pozycji w zamówieniu', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'product_id', label: 'ID produktu', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'variant_id', label: 'ID wariantu', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'name', label: 'Nazwa produktu', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'sku', label: 'SKU', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'ean', label: 'EAN', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'location', label: 'Lokalizacja w magazynie', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'warehouse_id', label: 'ID magazynu', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'auction_id', label: 'ID aukcji', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'attributes', label: 'Atrybuty', group: 'ORDER_ITEM', higher_plan: false, description: 'JSON string z atrybutami' },
        { field_key: 'price_brutto', label: 'Cena brutto (za szt.)', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'tax_rate', label: 'Stawka VAT (%)', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'quantity', label: 'Ilość', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'weight', label: 'Waga (kg)', group: 'ORDER_ITEM', higher_plan: false },
        { field_key: 'bundle_id', label: 'ID bundle', group: 'ORDER_ITEM', higher_plan: false, description: 'Jeśli produkt jest częścią bundle' },
    ],
    
    // 2. ORDER ITEM - POLA Z NAGŁÓWKA (dla kontekstu)
    'ORDER_CONTEXT': [
        { field_key: 'order_id', label: '🔗 ID zamówienia', group: 'ORDER_CONTEXT', higher_plan: false, description: 'Z nagłówka zamówienia' },
        { field_key: 'order_date_add', label: '🔗 Data zamówienia', group: 'ORDER_CONTEXT', higher_plan: false, description: 'Z nagłówka zamówienia' },
        { field_key: 'order_status_id', label: '🔗 Status zamówienia', group: 'ORDER_CONTEXT', higher_plan: false, description: 'Z nagłówka zamówienia' },
        { field_key: 'customer_email', label: '🔗 Email klienta', group: 'ORDER_CONTEXT', higher_plan: false, description: 'Z nagłówka zamówienia' },
        { field_key: 'customer_phone', label: '🔗 Telefon klienta', group: 'ORDER_CONTEXT', higher_plan: false, description: 'Z nagłówka zamówienia' },
        { field_key: 'delivery_method', label: '🔗 Metoda dostawy', group: 'ORDER_CONTEXT', higher_plan: false, description: 'Z nagłówka zamówienia' },
        { field_key: 'payment_method', label: '🔗 Metoda płatności', group: 'ORDER_CONTEXT', higher_plan: false, description: 'Z nagłówka zamówienia' },
    ],
    
    // 3. COMPUTED (pola obliczane dla pozycji)
    'ORDER_ITEM_COMPUTED': [
        { field_key: 'line_total_gross', label: 'Wartość brutto pozycji', group: 'ORDER_ITEM_COMPUTED', higher_plan: false, computed: true, description: 'price_brutto × quantity' },
        { field_key: 'line_net', label: 'Wartość netto pozycji', group: 'ORDER_ITEM_COMPUTED', higher_plan: true, computed: true, description: 'Obliczone z VAT' },
        { field_key: 'line_vat_amount', label: 'Kwota VAT pozycji', group: 'ORDER_ITEM_COMPUTED', higher_plan: true, computed: true, description: 'line_total × (VAT% / (100+VAT%))' },
        { field_key: 'weight_total', label: 'Waga całkowita', group: 'ORDER_ITEM_COMPUTED', higher_plan: false, computed: true, description: 'weight × quantity' },
    ],
};

// Helper: Spłaszcz wszystkie pola do jednej tablicy
function getFlatOrderItemFields() {
    const flat = [];
    for (const group in ORDER_ITEM_FIELDS) {
        flat.push(...ORDER_ITEM_FIELDS[group]);
    }
    return flat;
}

// Helper: Pobierz pola z grupy
function getOrderItemFieldsByGroup(groupName) {
    return ORDER_ITEM_FIELDS[groupName] || [];
}

// Helper: Znajdź pole po kluczu
function findOrderItemField(fieldKey) {
    const allFields = getFlatOrderItemFields();
    return allFields.find(f => f.field_key === fieldKey);
}
