// Wszystkie pola zamówień z BaseLinker API
// Bazowane na getOrders endpoint: https://api.baselinker.com/index.php?method=getOrders

const ORDER_FIELDS = {
    // 1. ORDER (nagłówek zamówienia)
    'ORDER': [
        { field_key: 'order_id', label: 'ID zamówienia', group: 'ORDER', higher_plan: false },
        { field_key: 'shop_order_id', label: 'ID sklepu', group: 'ORDER', higher_plan: false },
        { field_key: 'external_order_id', label: 'ID zewnętrzne', group: 'ORDER', higher_plan: false },
        { field_key: 'order_source', label: 'Źródło zamówienia', group: 'ORDER', higher_plan: false },
        { field_key: 'order_source_id', label: 'ID źródła', group: 'ORDER', higher_plan: false },
        { field_key: 'order_source_info', label: 'Info o źródle', group: 'ORDER', higher_plan: false, description: 'Obecnie niedostępny w API' },
        { field_key: 'order_status_id', label: 'Status ID', group: 'ORDER', higher_plan: false },
        { field_key: 'date_add', label: 'Data dodania', group: 'ORDER', higher_plan: false },
        { field_key: 'date_confirmed', label: 'Data potwierdzenia', group: 'ORDER', higher_plan: false },
        { field_key: 'date_in_status', label: 'Data w statusie', group: 'ORDER', higher_plan: false },
        { field_key: 'confirmed', label: 'Potwierdzone', group: 'ORDER', higher_plan: false },
        { field_key: 'user_login', label: 'Login użytkownika', group: 'ORDER', higher_plan: false },
        { field_key: 'currency', label: 'Waluta', group: 'ORDER', higher_plan: false },
        { field_key: 'payment_method', label: 'Metoda płatności', group: 'ORDER', higher_plan: false },
        { field_key: 'payment_method_cod', label: 'Czy pobranie?', group: 'ORDER', higher_plan: false },
        { field_key: 'payment_done', label: 'Płatność wykonana', group: 'ORDER', higher_plan: false },
        { field_key: 'user_comments', label: 'Komentarz klienta', group: 'ORDER', higher_plan: false },
        { field_key: 'admin_comments', label: 'Komentarz admin', group: 'ORDER', higher_plan: false },
        { field_key: 'email', label: 'Email', group: 'ORDER', higher_plan: false },
        { field_key: 'phone', label: 'Telefon', group: 'ORDER', higher_plan: false },
        { field_key: 'order_page', label: 'Strona zamówienia', group: 'ORDER', higher_plan: false },
        { field_key: 'pick_state', label: 'Status pickingu', group: 'ORDER', higher_plan: false, aliases: ['pick_status'] },
        { field_key: 'pack_state', label: 'Status pakowania', group: 'ORDER', higher_plan: false, aliases: ['pack_status'] },
    ],
    
    // 2. DELIVERY (adres dostawy + paczka)
    'DELIVERY': [
        { field_key: 'delivery_method_id', label: 'ID metody dostawy', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_method', label: 'Metoda dostawy', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_price', label: 'Cena dostawy', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_package_module', label: 'Moduł paczki', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_package_nr', label: 'Numer paczki', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_fullname', label: 'Imię i nazwisko', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_company', label: 'Firma', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_address', label: 'Adres', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_postcode', label: 'Kod pocztowy', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_city', label: 'Miasto', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_state', label: 'Województwo', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_country', label: 'Kraj', group: 'DELIVERY', higher_plan: false },
        { field_key: 'delivery_country_code', label: 'Kod kraju', group: 'DELIVERY', higher_plan: false },
    ],
    
    // 3. PICKUP POINT (punkt odbioru)
    'PICKUP_POINT': [
        { field_key: 'delivery_point_id', label: 'ID punktu odbioru', group: 'PICKUP_POINT', higher_plan: false },
        { field_key: 'delivery_point_name', label: 'Nazwa punktu', group: 'PICKUP_POINT', higher_plan: false },
        { field_key: 'delivery_point_address', label: 'Adres punktu', group: 'PICKUP_POINT', higher_plan: false },
        { field_key: 'delivery_point_postcode', label: 'Kod pocztowy punktu', group: 'PICKUP_POINT', higher_plan: false },
        { field_key: 'delivery_point_city', label: 'Miasto punktu', group: 'PICKUP_POINT', higher_plan: false },
    ],
    
    // 4. INVOICE (dane do faktury)
    'INVOICE': [
        { field_key: 'invoice_fullname', label: 'Nazwa (faktura)', group: 'INVOICE', higher_plan: true },
        { field_key: 'invoice_company', label: 'Firma (faktura)', group: 'INVOICE', higher_plan: true },
        { field_key: 'invoice_nip', label: 'NIP', group: 'INVOICE', higher_plan: true },
        { field_key: 'invoice_address', label: 'Adres (faktura)', group: 'INVOICE', higher_plan: true },
        { field_key: 'invoice_postcode', label: 'Kod pocztowy (faktura)', group: 'INVOICE', higher_plan: true },
        { field_key: 'invoice_city', label: 'Miasto (faktura)', group: 'INVOICE', higher_plan: true },
        { field_key: 'invoice_state', label: 'Województwo (faktura)', group: 'INVOICE', higher_plan: true },
        { field_key: 'invoice_country', label: 'Kraj (faktura)', group: 'INVOICE', higher_plan: true },
        { field_key: 'invoice_country_code', label: 'Kod kraju (faktura)', group: 'INVOICE', higher_plan: true },
        { field_key: 'want_invoice', label: 'Chce fakturę', group: 'INVOICE', higher_plan: true },
    ],
    
    // 5. EXTRA FIELDS (pola dodatkowe)
    'EXTRA_FIELDS': [
        { field_key: 'extra_field_1', label: 'Pole dodatkowe 1', group: 'EXTRA_FIELDS', higher_plan: false },
        { field_key: 'extra_field_2', label: 'Pole dodatkowe 2', group: 'EXTRA_FIELDS', higher_plan: false },
        { field_key: 'custom_extra_fields', label: 'Niestandardowe pola', group: 'EXTRA_FIELDS', higher_plan: true, description: 'Wymaga include_custom_extra_fields=true' },
    ],
    
    // 6. COMMISSION (prowizje marketplace)
    'COMMISSION': [
        { field_key: 'commission_net', label: 'Prowizja netto', group: 'COMMISSION', higher_plan: true, description: 'Wymaga include_commission_data=true' },
        { field_key: 'commission_gross', label: 'Prowizja brutto', group: 'COMMISSION', higher_plan: true, description: 'Wymaga include_commission_data=true' },
        { field_key: 'commission_currency', label: 'Waluta prowizji', group: 'COMMISSION', higher_plan: true, description: 'Wymaga include_commission_data=true' },
    ],
    
    // 7. CONNECT (integracje)
    'CONNECT': [
        { field_key: 'connect_integration_id', label: 'ID integracji Connect', group: 'CONNECT', higher_plan: true, description: 'Wymaga include_connect_data=true' },
        { field_key: 'connect_contractor_id', label: 'ID kontrahenta Connect', group: 'CONNECT', higher_plan: true, description: 'Wymaga include_connect_data=true' },
    ],
    
    // 8. COMPUTED DATES (daty - sformatowane)
    'COMPUTED_DATES': [
        { field_key: 'date_add_iso', label: 'Data dodania (ISO)', group: 'COMPUTED_DATES', higher_plan: false, computed: true, description: 'Unix timestamp → ISO 8601' },
        { field_key: 'date_confirmed_iso', label: 'Data potwierdzenia (ISO)', group: 'COMPUTED_DATES', higher_plan: false, computed: true, description: 'Unix timestamp → ISO 8601' },
        { field_key: 'date_in_status_iso', label: 'Data w statusie (ISO)', group: 'COMPUTED_DATES', higher_plan: false, computed: true, description: 'Unix timestamp → ISO 8601' },
        { field_key: 'date_add_local', label: 'Data dodania (lokalna)', group: 'COMPUTED_DATES', higher_plan: false, computed: true, description: 'Sformatowana do Europe/Warsaw' },
    ],
    
    // 9. COMPUTED ADDRESSES (adresy - połączone)
    'COMPUTED_ADDRESSES': [
        { field_key: 'delivery_address_full', label: 'Adres dostawy (pełny)', group: 'COMPUTED_ADDRESSES', higher_plan: false, computed: true, description: 'Ulica, kod, miasto, kraj' },
        { field_key: 'invoice_address_full', label: 'Adres faktury (pełny)', group: 'COMPUTED_ADDRESSES', higher_plan: false, computed: true, description: 'Ulica, kod, miasto, kraj' },
        { field_key: 'customer_display_name', label: 'Nazwa klienta', group: 'COMPUTED_ADDRESSES', higher_plan: false, computed: true, description: 'Firma lub imię/nazwisko' },
    ],
    
    // 10. COMPUTED SUMS (sumy)
    'COMPUTED_SUMS': [
        { field_key: 'order_products_gross', label: 'Suma produktów brutto', group: 'COMPUTED_SUMS', higher_plan: false, computed: true, description: 'Σ(cena × ilość)' },
        { field_key: 'order_total_gross', label: 'Suma całkowita brutto', group: 'COMPUTED_SUMS', higher_plan: false, computed: true, description: 'Produkty + dostawa' },
        { field_key: 'items_count', label: 'Liczba pozycji', group: 'COMPUTED_SUMS', higher_plan: false, computed: true, description: 'Σ(ilość)' },
        { field_key: 'unique_sku_count', label: 'Unikalne SKU', group: 'COMPUTED_SUMS', higher_plan: false, computed: true, description: 'Liczba różnych produktów' },
    ],
    
    // 11. COMPUTED VAT (VAT i netto)
    'COMPUTED_VAT': [
        { field_key: 'order_net', label: 'Zamówienie netto', group: 'COMPUTED_VAT', higher_plan: true, computed: true, description: 'Suma netto wszystkich pozycji' },
        { field_key: 'order_vat_amount', label: 'Kwota VAT', group: 'COMPUTED_VAT', higher_plan: true, computed: true, description: 'Suma VAT wszystkich pozycji' },
    ],
    
    // 12. COMPUTED STATUS (statusy bool)
    'COMPUTED_STATUS': [
        { field_key: 'is_cod', label: 'Czy pobranie?', group: 'COMPUTED_STATUS', higher_plan: false, computed: true, description: 'payment_method_cod === "1"' },
        { field_key: 'is_confirmed', label: 'Czy potwierdzone?', group: 'COMPUTED_STATUS', higher_plan: false, computed: true, description: 'confirmed === true' },
        { field_key: 'is_picked', label: 'Czy spikowane?', group: 'COMPUTED_STATUS', higher_plan: false, computed: true, description: 'pick_state === 1' },
        { field_key: 'is_packed', label: 'Czy spakowane?', group: 'COMPUTED_STATUS', higher_plan: false, computed: true, description: 'pack_state === 1' },
    ],
};

// Helper: Spłaszcz wszystkie pola do jednej tablicy
function getFlatOrderFields() {
    const flat = [];
    for (const group in ORDER_FIELDS) {
        flat.push(...ORDER_FIELDS[group]);
    }
    return flat;
}

// Helper: Pobierz pola z grupy
function getOrderFieldsByGroup(groupName) {
    return ORDER_FIELDS[groupName] || [];
}

// Helper: Znajdź pole po kluczu (z obsługą aliasów)
function findOrderField(fieldKey) {
    const allFields = getFlatOrderFields();
    return allFields.find(f => 
        f.field_key === fieldKey || 
        (f.aliases && f.aliases.includes(fieldKey))
    );
}
