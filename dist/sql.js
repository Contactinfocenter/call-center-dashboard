DROP FUNCTION IF EXISTS dashboard_analytics;

CREATE OR REPLACE FUNCTION dashboard_analytics(
    p_start_date date,
    p_end_date date,
    p_region text DEFAULT NULL,
    p_zone text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_call_reason text DEFAULT NULL,
    p_client_type text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN (
        WITH filtered AS (
            SELECT *,
                CASE
                    WHEN call_reason = 'Billing Issue' THEN
                        CASE
                            WHEN comments ILIKE '%billing queries%' THEN 'Billing Queries'
                            WHEN comments ILIKE '%refund%' THEN 'Refund'
                            WHEN comments ILIKE '%date extension request%' THEN 'Date Extension Request'
                            WHEN comments ILIKE '%payment process request%' THEN 'Payment Process Request'
                            WHEN comments ILIKE '%re-activation query%' THEN 'Re-activation Query'
                            WHEN comments ILIKE '%payment not updated%' THEN 'Payment Not Updated'
                            WHEN comments ILIKE '%offer query%' THEN 'Offer Query'
                            WHEN comments ILIKE '%compensation rural%' THEN 'Compensation Rural'
                            WHEN comments ILIKE '%invoice request%' THEN 'Invoice Request'
                            WHEN comments ILIKE '%bill collection request%' THEN 'Bill Collection Request'
                            WHEN comments ILIKE '%referral query%' THEN 'Referral Query'
                            WHEN comments ILIKE '%payment update request%' THEN 'Payment Update Request'
                            WHEN comments ILIKE '%compensation city%' THEN 'Compensation City'
                            WHEN comments ILIKE '%online payment problem%' THEN 'Online Payment Problem'
                            WHEN comments ILIKE '%carnival assure%' THEN 'Carnival Assure'
                            WHEN comments ILIKE '%payment link not generated%' THEN 'Payment link not generated'
                            WHEN comments ILIKE '%iptsp_billing%' THEN 'IPTSP_Billing'
                            ELSE 'Other Billing'
                        END
                    ELSE NULL
                END AS billing_sub_reason
            FROM public.all_calls
            WHERE source_date BETWEEN p_start_date AND p_end_date
              AND (p_region IS NULL OR region = p_region)
              AND (p_zone IS NULL OR zone = p_zone)
              AND (p_status IS NULL OR status = p_status)
              AND (p_call_reason IS NULL OR call_reason = p_call_reason)
              AND (p_client_type IS NULL OR client_type = p_client_type)
        ),

        today_data AS (
            SELECT call_reason, COUNT(*) AS today_count
            FROM public.all_calls
            WHERE source_date = p_end_date
              AND (p_region IS NULL OR region = p_region)
              AND (p_zone IS NULL OR zone = p_zone)
              AND (p_status IS NULL OR status = p_status)
              AND (p_call_reason IS NULL OR call_reason = p_call_reason)
              AND (p_client_type IS NULL OR client_type = p_client_type)
            GROUP BY 1
        ),

        history_data AS (
            SELECT call_reason,
                   COUNT(*) AS total_h,
                   COUNT(DISTINCT source_date) AS days
            FROM public.all_calls
            WHERE source_date < p_end_date
              AND source_date >= p_end_date - INTERVAL '7 days'
              AND (p_region IS NULL OR region = p_region)
              AND (p_zone IS NULL OR zone = p_zone)
              AND (p_status IS NULL OR status = p_status)
              AND (p_call_reason IS NULL OR call_reason = p_call_reason)
              AND (p_client_type IS NULL OR client_type = p_client_type)
            GROUP BY 1
        ),

        spikes_cte AS (
            SELECT
                t.call_reason,
                t.today_count AS today,
                ROUND(COALESCE(h.total_h::numeric / NULLIF(h.days,0), 0))::int AS avg_val,
                (t.today_count - ROUND(COALESCE(h.total_h::numeric / NULLIF(h.days,0), 0)))::int AS diff,
                CASE
                    WHEN COALESCE(h.total_h::numeric / NULLIF(h.days,0), 0) >= 1
                    THEN ROUND(((t.today_count - (h.total_h::numeric / NULLIF(h.days,0))) 
                        / (h.total_h::numeric / NULLIF(h.days,0))) * 100)::int
                    ELSE 0
                END AS pct,
                CASE 
                    WHEN (t.today_count - ROUND(COALESCE(h.total_h::numeric / NULLIF(h.days,0),0))) >= 3 THEN 'up'
                    WHEN (t.today_count - ROUND(COALESCE(h.total_h::numeric / NULLIF(h.days,0),0))) <= -3 THEN 'down'
                    ELSE 'none'
                END AS direction
            FROM today_data t
            LEFT JOIN history_data h USING (call_reason)
            WHERE (t.today_count - ROUND(COALESCE(h.total_h::numeric / NULLIF(h.days,0),0))) >= 3
               OR (t.today_count - ROUND(COALESCE(h.total_h::numeric / NULLIF(h.days,0),0))) <= -3
               OR t.today_count >= 5
        ),

        monthly_filtered AS (
            SELECT *,
                CASE
                    WHEN call_reason = 'Billing Issue' THEN
                        CASE
                            WHEN comments ILIKE '%billing queries%' THEN 'Billing Queries'
                            WHEN comments ILIKE '%refund%' THEN 'Refund'
                            WHEN comments ILIKE '%date extension request%' THEN 'Date Extension Request'
                            WHEN comments ILIKE '%payment process request%' THEN 'Payment Process Request'
                            WHEN comments ILIKE '%re-activation query%' THEN 'Re-activation Query'
                            WHEN comments ILIKE '%payment not updated%' THEN 'Payment Not Updated'
                            WHEN comments ILIKE '%offer query%' THEN 'Offer Query'
                            WHEN comments ILIKE '%compensation rural%' THEN 'Compensation Rural'
                            WHEN comments ILIKE '%invoice request%' THEN 'Invoice Request'
                            WHEN comments ILIKE '%bill collection request%' THEN 'Bill Collection Request'
                            WHEN comments ILIKE '%referral query%' THEN 'Referral Query'
                            WHEN comments ILIKE '%payment update request%' THEN 'Payment Update Request'
                            WHEN comments ILIKE '%compensation city%' THEN 'Compensation City'
                            WHEN comments ILIKE '%online payment problem%' THEN 'Online Payment Problem'
                            WHEN comments ILIKE '%carnival assure%' THEN 'Carnival Assure'
                            WHEN comments ILIKE '%payment link not generated%' THEN 'Payment link not generated'
                            WHEN comments ILIKE '%iptsp_billing%' THEN 'IPTSP_Billing'
                            ELSE 'Other Billing'
                        END
                    ELSE NULL
                END AS billing_sub_reason
            FROM public.all_calls
            WHERE source_date > p_end_date - INTERVAL '30 days'
              AND source_date <= p_end_date
              AND (p_region IS NULL OR region = p_region)
              AND (p_zone IS NULL OR zone = p_zone)
        ),

        monthly_hourly_stats AS (
            SELECT
                source_date,
                EXTRACT(HOUR FROM call_date) AS hour,
                COUNT(*) AS total,
                COUNT(DISTINCT phone_number) AS unique_callers,
                COUNT(DISTINCT full_name) AS agents_online
            FROM monthly_filtered
            GROUP BY 1, 2
        )

        SELECT json_build_object(

            'summary', (
                SELECT json_build_object(
                    'total_calls', COUNT(*),
                    'unique_callers', COUNT(DISTINCT phone_number),
                    'avg_acht', ROUND(AVG(acht))::int,
                    'active_agents', COUNT(DISTINCT full_name),
                    'fcr_count', COUNT(*) FILTER (WHERE UPPER(status) = 'FCR')
                )
                FROM filtered
            ),

            'hourly', (
                SELECT json_agg(h)
                FROM (
                  SELECT
                    EXTRACT(HOUR FROM call_date) AS hour,
                    COUNT(*) AS total,
                    COUNT(DISTINCT phone_number) AS unique_callers,
                    COUNT(DISTINCT full_name) AS agents_online
                  FROM filtered
                  GROUP BY 1 ORDER BY 1
                ) h
            ),

            'region_breakdown', (
                SELECT json_agg(r)
                FROM (
                    SELECT region, COUNT(*) AS total
                    FROM filtered
                    GROUP BY 1 ORDER BY 2 DESC
                ) r
            ),

            'spikes', (
                SELECT json_agg(s)
                FROM (
                    SELECT * FROM spikes_cte
                    WHERE direction IN ('up','down')
                    ORDER BY ABS(diff) DESC LIMIT 4
                ) s
            ),

            'monthly_averages', (
                SELECT json_build_object(
                    'hourly_avg', (
                        SELECT json_agg(ma) FROM (
                            SELECT
                                hour,
                                ROUND(AVG(total))::int AS avg_total,
                                ROUND(AVG(unique_callers))::int AS avg_unique,
                                ROUND(AVG(agents_online))::int AS avg_agents
                            FROM monthly_hourly_stats
                            GROUP BY 1 ORDER BY 1
                        ) ma
                    ),
                    'region_avg', (
                        SELECT json_agg(ra)
                        FROM (
                            SELECT 
                                region,
                                ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT source_date), 0))::int AS total
                            FROM monthly_filtered
                            GROUP BY 1
                            ORDER BY total DESC
                        ) ra
                    )
                )
            ),

            'reason_breakdown', (
                SELECT json_agg(rr)
                FROM (
                    SELECT call_reason,
                           COUNT(*) AS total,
                           ROUND(AVG(acht))::int AS avg_acht
                    FROM filtered
                    WHERE source_date = p_end_date
                    GROUP BY 1
                    ORDER BY 2 DESC
                    LIMIT 10
                ) rr
            ),

            'billing_breakdown', (
                SELECT json_agg(b)
                FROM (
                    SELECT billing_sub_reason,
                           COUNT(*) AS total,
                           ROUND(AVG(acht))::int AS avg_acht
                    FROM filtered
                    WHERE call_reason = 'Billing Issue'
                      AND source_date = p_end_date
                    GROUP BY 1
                    ORDER BY 2 DESC
                ) b
            ),

            'monthly_reason_breakdown', (
                SELECT json_agg(mr)
                FROM (
                    SELECT call_reason,
                           ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT source_date),0))::int AS avg_total,
                           ROUND(AVG(acht))::int AS avg_acht
                    FROM monthly_filtered
                    GROUP BY 1
                    ORDER BY avg_total DESC
                    LIMIT 10
                ) mr
            ),

            'monthly_billing_breakdown', (
                SELECT json_agg(mb)
                FROM (
                    SELECT billing_sub_reason,
                           ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT source_date),0))::int AS avg_total,
                           ROUND(AVG(acht))::int AS avg_acht
                    FROM monthly_filtered
                    WHERE call_reason = 'Billing Issue'
                    GROUP BY 1
                    ORDER BY avg_total DESC
                ) mb
            ),

            'daily_trend', (
                SELECT json_agg(d)
                FROM (
                    SELECT 
                        source_date,
                        COUNT(*) AS total,
                        ROUND(AVG(acht), 0) AS avg_acht,
                        ROUND(
                            COUNT(*) FILTER (WHERE UPPER(status) = 'FCR')::numeric
                            / NULLIF(COUNT(*),0) * 100
                        ,0) AS fcr_percent
                    FROM filtered
                    GROUP BY 1
                    ORDER BY 1
                ) d
            )
        )
    );
END;
$$;