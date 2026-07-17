package com.java.vibecraft.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.Set;

/**
 * Turns Stripe's minor-unit amounts into something a pricing page can print.
 *
 * <p>Stripe always quotes money in the currency's smallest unit - 49900 paise, not 499 rupees - so the
 * division has to happen somewhere, and doing it in the browser would mean every client re-deciding how many
 * decimal places a currency has. The formatted string is produced once, server-side, and travels on
 * {@code PlanResponse.price}; the raw amount travels alongside it for anyone who needs to compare or sort.
 */
public final class MoneyFormat {

    private MoneyFormat() {
    }

    /** Currencies Stripe treats as having no minor unit at all - the amount is already whole. */
    private static final Set<String> ZERO_DECIMAL = Set.of("bif", "clp", "djf", "gnf", "jpy", "kmf", "krw",
            "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf");

    private static final Map<String, String> SYMBOLS = Map.of(
            "inr", "₹", "usd", "$", "eur", "€", "gbp", "£", "jpy", "¥", "aud", "A$", "cad", "C$");

    /**
     * {@code (49900, "inr")} → {@code "₹499"}, {@code (2050, "usd")} → {@code "$20.50"}.
     *
     * <p>A whole amount loses its {@code .00}: a plan priced at exactly ₹499 should read that way rather than
     * as ₹499.00. A currency with no symbol falls back to its code, which is wrong-looking but never
     * misleading. Returns {@code "Free"} for nothing to pay, which is what the free plan's card shows.
     */
    public static String format(Integer amountMinor, String currency) {
        if (amountMinor == null || amountMinor <= 0) {
            return "Free";
        }
        String code = currency == null ? "usd" : currency.toLowerCase();

        BigDecimal amount = ZERO_DECIMAL.contains(code)
                ? BigDecimal.valueOf(amountMinor)
                : BigDecimal.valueOf(amountMinor).movePointLeft(2);

        boolean whole = amount.stripTrailingZeros().scale() <= 0;
        String plain = amount.setScale(whole ? 0 : 2, RoundingMode.UNNECESSARY).toPlainString();
        int dot = plain.indexOf('.');
        String integer = dot < 0 ? plain : plain.substring(0, dot);
        String fraction = dot < 0 ? "" : plain.substring(dot);
        String number = group(integer, "inr".equals(code)) + fraction;

        String symbol = SYMBOLS.get(code);
        return symbol != null ? symbol + number : code.toUpperCase() + " " + number;
    }

    /**
     * Groups digits the way that currency's own readers expect. "₹1499" reads as a typo on a pricing page, and
     * rupees group in the Indian system - the last three digits, then pairs (₹1,49,900 for a lakh and a half) -
     * which a western "#,###" pattern would render as ₹149,900: right arithmetic, wrong to anyone paying in it.
     *
     * <p>Done by hand rather than with {@code NumberFormat}: {@code DecimalFormat} supports only one group size,
     * so even under the {@code en-IN} locale it produces ₹149,900. A test caught this - an earlier version
     * trusted the locale and was wrong.
     */
    static String group(String digits, boolean indian) {
        if (digits.length() <= 3) {
            return digits;
        }
        String lastThree = digits.substring(digits.length() - 3);
        String rest = digits.substring(0, digits.length() - 3);
        int size = indian ? 2 : 3;

        StringBuilder grouped = new StringBuilder();
        int firstGroup = rest.length() % size == 0 ? size : rest.length() % size;
        grouped.append(rest, 0, firstGroup);
        for (int i = firstGroup; i < rest.length(); i += size) {
            grouped.append(',').append(rest, i, i + size);
        }
        return grouped.append(',').append(lastThree).toString();
    }
}
