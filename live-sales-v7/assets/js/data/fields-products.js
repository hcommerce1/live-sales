// Pola produktów z katalogu BaseLinker
// Bazowane na getInventoryProductsData i getInventoryProductsList

const PRODUCT_FIELDS = {
    // 1. PRODUCT CORE (podstawowe dane)
    'PRODUCT_CORE': [
        { field_key: 'id', label: 'ID produktu', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'sku', label: 'SKU', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'ean', label: 'EAN', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'ean_additional', label: 'Dodatkowe EAN', group: 'PRODUCT_CORE', higher_plan: false, description: 'Tablica EAN' },
        { field_key: 'asin', label: 'ASIN (Amazon)', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'name', label: 'Nazwa produktu', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'tags', label: 'Tagi', group: 'PRODUCT_CORE', higher_plan: false, description: 'Tablica tagów' },
        { field_key: 'tax_rate', label: 'Stawka VAT (%)', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'weight', label: 'Waga (kg)', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'height', label: 'Wysokość (cm)', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'width', label: 'Szerokość (cm)', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'length', label: 'Długość (cm)', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'star', label: 'Gwiazdka (wyróżnienie)', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'category_id', label: 'ID kategorii', group: 'PRODUCT_CORE', higher_plan: false },
        { field_key: 'manufacturer_id', label: 'ID producenta', group: 'PRODUCT_CORE', higher_plan: false },
    ],
    
    // 2. PRODUCT PRICES (ceny)
    'PRODUCT_PRICES': [
        { field_key: 'price_default', label: 'Cena domyślna', group: 'PRODUCT_PRICES', higher_plan: false, computed: true, description: 'Z głównej grupy cenowej' },
        { field_key: 'prices', label: 'Ceny (wszystkie grupy)', group: 'PRODUCT_PRICES', higher_plan: true, description: 'Object {price_group_id: cena}' },
        // Dynamiczne: price[105], price[106], etc. - generowane w runtime
    ],
    
    // 3. PRODUCT STOCK (stany magazynowe)
    'PRODUCT_STOCK': [
        { field_key: 'stock_total', label: 'Stan całkowity', group: 'PRODUCT_STOCK', higher_plan: false, computed: true, description: 'Suma ze wszystkich magazynów' },
        { field_key: 'stock_available', label: 'Stan dostępny', group: 'PRODUCT_STOCK', higher_plan: false, computed: true, description: 'Stan - rezerwacje' },
        { field_key: 'has_stock', label: 'Czy jest na stanie?', group: 'PRODUCT_STOCK', higher_plan: false, computed: true, description: 'stock_total > 0' },
        { field_key: 'stock', label: 'Stany (wszystkie magazyny)', group: 'PRODUCT_STOCK', higher_plan: false, description: 'Object {warehouse_id: ilość}' },
        // Dynamiczne: stock[bl_206], stock[bl_207], etc.
    ],
    
    // 4. PRODUCT LOCATIONS (lokalizacje)
    'PRODUCT_LOCATIONS': [
        { field_key: 'locations', label: 'Lokalizacje w magazynach', group: 'PRODUCT_LOCATIONS', higher_plan: false, description: 'Object {warehouse_id: lokalizacja}' },
        // Dynamiczne: location[bl_206], etc.
    ],
    
    // 5. PRODUCT COSTS (koszty i marże)
    'PRODUCT_COSTS': [
        { field_key: 'average_cost', label: 'Średni koszt', group: 'PRODUCT_COSTS', higher_plan: true },
        { field_key: 'average_landed_cost', label: 'Średni koszt landed', group: 'PRODUCT_COSTS', higher_plan: true, description: 'Koszt z transportem' },
    ],
    
    // 6. PRODUCT IMAGES (zdjęcia)
    'PRODUCT_IMAGES': [
        { field_key: 'image_first', label: 'Pierwsze zdjęcie', group: 'PRODUCT_IMAGES', higher_plan: false, computed: true, description: 'URL pierwszego zdjęcia' },
        { field_key: 'images_count', label: 'Liczba zdjęć', group: 'PRODUCT_IMAGES', higher_plan: false, computed: true },
        { field_key: 'images', label: 'Zdjęcia (wszystkie)', group: 'PRODUCT_IMAGES', higher_plan: false, description: 'Object {1..16: url}' },
        // Dynamiczne: image_1, image_2, ..., image_16
    ],
    
    // 7. PRODUCT TEXT FIELDS (pola tekstowe)
    'PRODUCT_TEXT_FIELDS': [
        { field_key: 'text_fields', label: 'Pola tekstowe', group: 'PRODUCT_TEXT_FIELDS', higher_plan: false, description: 'Object {key: value}. Klucz format: field|lang|source_id' },
        // Przykłady dynamicznych: name|pl|0, description|pl|0, etc.
        // Lista kluczy: getInventoryAvailableTextFieldKeys
    ],
    
    // 8. PRODUCT VARIANTS (warianty)
    'PRODUCT_VARIANTS': [
        { field_key: 'variants', label: 'Warianty produktu', group: 'PRODUCT_VARIANTS', higher_plan: false, description: 'Object {variant_id: {name, sku, ean, prices, stock, locations}}' },
        { field_key: 'variants_count', label: 'Liczba wariantów', group: 'PRODUCT_VARIANTS', higher_plan: false, computed: true },
    ],
    
    // 9. PRODUCT SUPPLIERS (dostawcy)
    'PRODUCT_SUPPLIERS': [
        { field_key: 'suppliers', label: 'Dostawcy', group: 'PRODUCT_SUPPLIERS', higher_plan: true, description: 'Array [{id, product_code, cost}]' },
        { field_key: 'suppliers_count', label: 'Liczba dostawców', group: 'PRODUCT_SUPPLIERS', higher_plan: true, computed: true },
    ],
    
    // 10. PRODUCT BUNDLE (pakiety/zestawy)
    'PRODUCT_BUNDLE': [
        { field_key: 'bundle_products', label: 'Składniki bundle', group: 'PRODUCT_BUNDLE', higher_plan: false, description: 'Object {product_id: ilość}' },
        { field_key: 'is_bundle', label: 'Czy jest bundle?', group: 'PRODUCT_BUNDLE', higher_plan: false, computed: true },
    ],
    
    // 11. PRODUCT LINKS (powiązania zewnętrzne)
    'PRODUCT_LINKS': [
        { field_key: 'links', label: 'Linki do magazynów zewnętrznych', group: 'PRODUCT_LINKS', higher_plan: false, description: 'Object {external_warehouse_id: {product_id, variant_id}}' },
    ],
    
    // 12. PRODUCT STOCK UNITS (jednostki magazynowe)
    'PRODUCT_STOCK_UNITS': [
        { field_key: 'stock_erp_units', label: 'Jednostki ERP', group: 'PRODUCT_STOCK_UNITS', higher_plan: true, description: 'Object {warehouse_id: [{quantity, purchase_cost, expiry_date}]}' },
        { field_key: 'stock_wms_units', label: 'Jednostki WMS', group: 'PRODUCT_STOCK_UNITS', higher_plan: true, description: 'Object {warehouse_id: [{quantity, location, expiry_date, batch, serial_no}]}' },
    ],
    
    // 13. COMPUTED (pola obliczane)
    'PRODUCT_COMPUTED': [
        { field_key: 'volume_cm3', label: 'Objętość (cm³)', group: 'PRODUCT_COMPUTED', higher_plan: false, computed: true, description: 'height × width × length' },
        { field_key: 'volumetric_weight', label: 'Waga objętościowa', group: 'PRODUCT_COMPUTED', higher_plan: false, computed: true, description: 'volume_cm3 / współczynnik' },
        { field_key: 'margin_gross_value', label: 'Marża (wartość)', group: 'PRODUCT_COMPUTED', higher_plan: true, computed: true, description: 'price - average_cost' },
        { field_key: 'margin_gross_pct', label: 'Marża (%)', group: 'PRODUCT_COMPUTED', higher_plan: true, computed: true, description: '(price - cost) / price × 100' },
        { field_key: 'sell_price_net', label: 'Cena sprzedaży netto', group: 'PRODUCT_COMPUTED', higher_plan: true, computed: true, description: 'Cena / (1 + VAT%)' },
        { field_key: 'has_ean', label: 'Czy ma EAN?', group: 'PRODUCT_COMPUTED', higher_plan: false, computed: true },
        { field_key: 'has_images', label: 'Czy ma zdjęcia?', group: 'PRODUCT_COMPUTED', higher_plan: false, computed: true },
        { field_key: 'has_description', label: 'Czy ma opis?', group: 'PRODUCT_COMPUTED', higher_plan: false, computed: true },
    ],
};

// Helper: Spłaszcz wszystkie pola do jednej tablicy
function getFlatProductFields() {
    const flat = [];
    for (const group in PRODUCT_FIELDS) {
        flat.push(...PRODUCT_FIELDS[group]);
    }
    return flat;
}

// Helper: Pobierz pola z grupy
function getProductFieldsByGroup(groupName) {
    return PRODUCT_FIELDS[groupName] || [];
}

// Helper: Znajdź pole po kluczu
function findProductField(fieldKey) {
    const allFields = getFlatProductFields();
    return allFields.find(f => f.field_key === fieldKey);
}
