package com.vibecraft.account.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;
import java.util.Set;

/**
 * Turns Stripe's minor-unit amounts into something a pricing page can print.
 *
 * <p>Handles: choosing the right divisor for the currency (some have no minor unit at all), dropping a zero fraction,
 * grouping the digits and prefixing the symbol - falling back to the uppercase currency code when there is no symbol
 * for it.
 *
 * <p>Grouping is per-currency because rupees group as the last three digits and then in pairs, which DecimalFormat
 * cannot produce even under the en-IN locale.
 */
public final class MoneyFormat {

    private MoneyFormat() {
    }

    private static final Set<String> ZERO_DECIMAL = Set.of("bif", "clp", "djf", "gnf", "jpy", "kmf", "krw",
            "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf");

    private static final Map<String, String> SYMBOLS = Map.of(
            "inr", "₹", "usd", "$", "eur", "€", "gbp", "£", "jpy", "¥", "aud", "A$", "cad", "C$");

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
