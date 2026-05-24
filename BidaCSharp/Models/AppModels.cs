using System.Security.Claims;

namespace BidaCSharp.Models;

public sealed class CurrentUser
{
    public int id { get; init; }
    public string username { get; init; } = string.Empty;
    public string full_name { get; init; } = string.Empty;
    public string role { get; init; } = string.Empty;

    public static CurrentUser FromClaims(ClaimsPrincipal principal)
    {
        return new CurrentUser
        {
            id = int.TryParse(principal.FindFirstValue("id"), out var idValue) ? idValue : 0,
            username = principal.FindFirstValue("username") ?? string.Empty,
            full_name = principal.FindFirstValue("full_name") ?? string.Empty,
            role = principal.FindFirstValue("role") ?? string.Empty
        };
    }
}

public sealed class user_record
{
    public int id { get; set; }
    public string username { get; set; } = string.Empty;
    public string password { get; set; } = string.Empty;
    public string full_name { get; set; } = string.Empty;
    public string role { get; set; } = string.Empty;
    public bool active { get; set; }
}

public sealed class login_request
{
    public string? username { get; set; }
    public string? password { get; set; }
}

public sealed class login_response
{
    public string token { get; set; } = string.Empty;
    public object user { get; set; } = new();
}

public sealed class table_record
{
    public int id { get; set; }
    public string name { get; set; } = string.Empty;
    public string type { get; set; } = string.Empty;
    public decimal price_per_hour { get; set; }
    public string status { get; set; } = string.Empty;
    public int position_order { get; set; }
    public bool active { get; set; }
    public int? session_id { get; set; }
    public DateTime? start_time { get; set; }
    public string? session_status { get; set; }
    public int? combo_id { get; set; }
    public string? combo_name { get; set; }
    public int? combo_hours { get; set; }
    public decimal? combo_price { get; set; }
    public string? combo_gift_type { get; set; }
    public string? combo_gift_name { get; set; }
    public string? active_order_summary { get; set; }
    public int active_order_count { get; set; }
    public string? reservation_customer_name { get; set; }
    public string? reservation_customer_phone { get; set; }
    public string? reservation_note { get; set; }
    public DateTime? reservation_time { get; set; }
    public int? reservation_id { get; set; }
}

public sealed class table_request
{
    public string? name { get; set; }
    public string? type { get; set; }
    public decimal? price_per_hour { get; set; }
    public int? position_order { get; set; }
}

public sealed class menu_category_record
{
    public int id { get; set; }
    public string name { get; set; } = string.Empty;
    public string icon { get; set; } = string.Empty;
    public int sort_order { get; set; }
    public bool active { get; set; }
}

public sealed class menu_item_record
{
    public int id { get; set; }
    public int category_id { get; set; }
    public string? category_name { get; set; }
    public string name { get; set; } = string.Empty;
    public decimal price { get; set; }
    public string unit { get; set; } = string.Empty;
    public string? description { get; set; }
    public string? image_url { get; set; }
    public bool active { get; set; }
    public int recipe_count { get; set; }
    public bool has_inventory_recipe { get; set; }
    public decimal? available_stock_estimate { get; set; }
    public string? inventory_status { get; set; }
}

public sealed class menu_item_request
{
    public int? category_id { get; set; }
    public string? name { get; set; }
    public decimal? price { get; set; }
    public string? unit { get; set; }
    public string? description { get; set; }
    public string? image_url { get; set; }
}

public sealed class session_record
{
    public int id { get; set; }
    public int table_id { get; set; }
    public DateTime start_time { get; set; }
    public int? combo_id { get; set; }
    public string? combo_name { get; set; }
    public int? combo_hours { get; set; }
    public decimal? combo_price { get; set; }
    public string? combo_gift_type { get; set; }
    public int? combo_gift_item_id { get; set; }
    public string? combo_gift_name { get; set; }
    public DateTime? end_time { get; set; }
    public int total_minutes { get; set; }
    public decimal total_amount { get; set; }
    public string status { get; set; } = string.Empty;
    public int? created_by { get; set; }
    public string? table_name { get; set; }
    public decimal? price_per_hour { get; set; }
    public string? table_type { get; set; }
}

public sealed class start_session_request
{
    public int? table_id { get; set; }
    public int? combo_id { get; set; }
    public string? combo_name { get; set; }
    public int? combo_hours { get; set; }
    public decimal? combo_price { get; set; }
    public string? combo_gift_type { get; set; }
    public int? combo_gift_item_id { get; set; }
    public string? combo_gift_name { get; set; }
}

public sealed class order_record
{
    public int id { get; set; }
    public int session_id { get; set; }
    public decimal total_amount { get; set; }
    public string status { get; set; } = string.Empty;
    public int? created_by { get; set; }
}

public sealed class order_item_record
{
    public int id { get; set; }
    public int order_id { get; set; }
    public int menu_item_id { get; set; }
    public string item_name { get; set; } = string.Empty;
    public decimal item_price { get; set; }
    public int quantity { get; set; }
    public decimal subtotal { get; set; }
    public string? note { get; set; }
}

public sealed class order_request
{
    public int? session_id { get; set; }
    public int? menu_item_id { get; set; }
    public int? quantity { get; set; }
    public string? note { get; set; }
}

public sealed class table_order_request_record
{
    public int id { get; set; }
    public int table_id { get; set; }
    public int session_id { get; set; }
    public string status { get; set; } = string.Empty;
    public int total_quantity { get; set; }
    public string? request_note { get; set; }
    public string? customer_ip { get; set; }
    public string? user_agent { get; set; }
    public DateTime created_at { get; set; }
    public DateTime? reviewed_at { get; set; }
    public int? reviewed_by { get; set; }
}

public sealed class table_order_request_item_record
{
    public int id { get; set; }
    public int request_id { get; set; }
    public int menu_item_id { get; set; }
    public string item_name { get; set; } = string.Empty;
    public decimal item_price { get; set; }
    public int quantity { get; set; }
    public string? note { get; set; }
    public decimal subtotal { get; set; }
}

public sealed class table_order_request_item_input
{
    public int? menu_item_id { get; set; }
    public int? quantity { get; set; }
    public string? note { get; set; }
}

public sealed class table_order_request_create
{
    public List<table_order_request_item_input>? items { get; set; }
    public string? note { get; set; }
}

public sealed class quantity_request
{
    public int quantity { get; set; }
}

public sealed class transfer_table_request
{
    public int? session_id { get; set; }
    public int? to_table_id { get; set; }
}

public sealed class merge_tables_request
{
    public int? primary_session_id { get; set; }
    public List<int>? merge_session_ids { get; set; }
}

public sealed class surcharge_record
{
    public int id { get; set; }
    public string name { get; set; } = string.Empty;
    public string type { get; set; } = string.Empty;
    public decimal value { get; set; }
    public bool active { get; set; }
}

public sealed class session_surcharge_record
{
    public int id { get; set; }
    public int session_id { get; set; }
    public int? surcharge_id { get; set; }
    public string name { get; set; } = string.Empty;
    public string type { get; set; } = string.Empty;
    public decimal value { get; set; }
    public decimal amount { get; set; }
}

public sealed class payment_request
{
    public int? session_id { get; set; }
    public decimal? discount_percent { get; set; }
    public string? payment_method { get; set; }
    public List<int>? surcharge_ids { get; set; }
    public string? note { get; set; }
    public string? customer_phone { get; set; }
}

public sealed class payment_record
{
    public int id { get; set; }
    public int session_id { get; set; }
    public string? table_name { get; set; }
    public DateTime? start_time { get; set; }
    public DateTime? end_time { get; set; }
    public int play_duration { get; set; }
    public decimal play_amount { get; set; }
    public decimal order_amount { get; set; }
    public decimal surcharge_amount { get; set; }
    public decimal discount_percent { get; set; }
    public decimal discount_amount { get; set; }
    public decimal total_amount { get; set; }
    public string payment_method { get; set; } = string.Empty;
    public string? note { get; set; }
    public int? customer_id { get; set; }
    public string? customer_phone { get; set; }
    public string? customer_rank { get; set; }
    public int membership_points_earned { get; set; }
    public int? created_by { get; set; }
    public DateTime created_at { get; set; }
    public string? order_items_summary { get; set; }
    public string? table_type { get; set; }
}

public sealed class customer_record
{
    public int id { get; set; }
    public string phone { get; set; } = string.Empty;
    public string? full_name { get; set; }
    public string? rank_name { get; set; }
    public int points { get; set; }
    public decimal total_spent { get; set; }
    public int total_visits { get; set; }
    public DateTime? last_played_at { get; set; }
    public bool active { get; set; }
    public string? note { get; set; }
    public DateTime created_at { get; set; }
    public DateTime updated_at { get; set; }
}

public sealed class customer_request
{
    public string? phone { get; set; }
    public string? full_name { get; set; }
    public string? rank_name { get; set; }
    public int? points { get; set; }
    public string? note { get; set; }
}

public sealed class membership_points_history_record
{
    public int id { get; set; }
    public int customer_id { get; set; }
    public int? payment_id { get; set; }
    public int points_delta { get; set; }
    public int points_after { get; set; }
    public string reason { get; set; } = string.Empty;
    public string? note { get; set; }
    public DateTime created_at { get; set; }
}

public sealed class reservation_record
{
    public int id { get; set; }
    public int table_id { get; set; }
    public string customer_name { get; set; } = string.Empty;
    public string? customer_phone { get; set; }
    public DateTime reserved_time { get; set; }
    public string? note { get; set; }
    public string status { get; set; } = string.Empty;
    public int? created_by { get; set; }
}

public sealed class reservation_request
{
    public int? table_id { get; set; }
    public string? customer_name { get; set; }
    public string? customer_phone { get; set; }
    public string? reserved_time { get; set; }
    public string? note { get; set; }
}

public sealed class setting_record
{
    public int id { get; set; }
    public string setting_key { get; set; } = string.Empty;
    public string? setting_value { get; set; }
}

public sealed class inventory_item_record
{
    public int id { get; set; }
    public string name { get; set; } = string.Empty;
    public string unit { get; set; } = string.Empty;
    public decimal current_stock { get; set; }
    public decimal min_stock { get; set; }
    public bool active { get; set; }
}

public sealed class inventory_item_request
{
    public string? name { get; set; }
    public string? unit { get; set; }
    public decimal? current_stock { get; set; }
    public decimal? min_stock { get; set; }
}

public sealed class inventory_adjust_request
{
    public decimal quantity_change { get; set; }
    public string? note { get; set; }
}

public sealed class inventory_transaction_record
{
    public int id { get; set; }
    public int inventory_item_id { get; set; }
    public string transaction_type { get; set; } = string.Empty;
    public decimal quantity_change { get; set; }
    public decimal stock_before { get; set; }
    public decimal stock_after { get; set; }
    public string? reference_type { get; set; }
    public int? reference_id { get; set; }
    public string? note { get; set; }
    public int? created_by { get; set; }
    public DateTime created_at { get; set; }
}

public sealed class menu_recipe_record
{
    public int id { get; set; }
    public int menu_item_id { get; set; }
    public int inventory_item_id { get; set; }
    public decimal quantity_required { get; set; }
    public string inventory_item_name { get; set; } = string.Empty;
    public string inventory_unit { get; set; } = string.Empty;
    public decimal current_stock { get; set; }
    public decimal min_stock { get; set; }
    public bool active { get; set; }
}

public sealed class menu_recipe_request
{
    public List<menu_recipe_entry_request>? ingredients { get; set; }
}

public sealed class menu_recipe_entry_request
{
    public int? inventory_item_id { get; set; }
    public decimal? quantity_required { get; set; }
}

public sealed class table_efficiency_record
{
    public int table_id { get; set; }
    public string table_name { get; set; } = string.Empty;
    public string table_type { get; set; } = string.Empty;
    public int sessions_count { get; set; }
    public decimal total_minutes { get; set; }
    public decimal play_revenue { get; set; }
    public decimal avg_minutes { get; set; }
}

public sealed class report_top_item
{
    public string item_name { get; set; } = string.Empty;
    public int total_qty { get; set; }
    public decimal total_revenue { get; set; }
}
