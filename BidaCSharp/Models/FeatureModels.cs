namespace BidaCSharp.Models;

public sealed class label_value_record
{
    public string label { get; set; } = string.Empty;
    public decimal value { get; set; }
}

public sealed class daily_revenue_record
{
    public DateTime revenue_date { get; set; }
    public decimal total_amount { get; set; }
}

public sealed class chatbot_book_table_request
{
    public string? time { get; set; }
    public int? people { get; set; }
    public string? customer_name { get; set; }
    public string? preferred_type { get; set; }
    public string? table_name { get; set; }
    public decimal? budget_per_hour { get; set; }
}

public sealed class chatbot_price_summary_record
{
    public string type { get; set; } = string.Empty;
    public decimal min_price { get; set; }
    public decimal max_price { get; set; }
    public int total_tables { get; set; }
}
