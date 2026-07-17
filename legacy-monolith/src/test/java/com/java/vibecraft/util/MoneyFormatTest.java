package com.java.vibecraft.util;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** What a pricing card prints, from what Stripe actually quotes. */
class MoneyFormatTest {

    @Test
    @DisplayName("formats Stripe's minor units as the amount a person recognises")
    void formatsMinorUnits() {
        assertEquals("₹499", MoneyFormat.format(49_900, "inr"));
        assertEquals("₹1,499", MoneyFormat.format(149_900, "inr"));
        assertEquals("$20", MoneyFormat.format(2_000, "usd"));
    }

    @Test
    @DisplayName("keeps the decimals only when there are any")
    void keepsDecimalsOnlyWhenPresent() {
        // A plan priced at exactly ₹499 should not read as ₹499.00 on the card...
        assertEquals("₹499", MoneyFormat.format(49_900, "inr"));
        // ...but a real fractional amount must not be rounded away.
        assertEquals("$20.50", MoneyFormat.format(2_050, "usd"));
        assertEquals("$0.99", MoneyFormat.format(99, "usd"));
    }

    @Test
    @DisplayName("treats a zero-decimal currency as already whole")
    void handlesZeroDecimalCurrencies() {
        // Stripe quotes yen with no minor unit at all - dividing by 100 would price the plan at a hundredth.
        assertEquals("¥3,000", MoneyFormat.format(3_000, "jpy"));
    }

    @Test
    @DisplayName("groups digits the way each currency is read")
    void groupsDigits() {
        assertEquals("₹1,499", MoneyFormat.format(149_900, "inr"));
        // Indian grouping, not western: a lakh and a half is 1,49,900 to anyone paying in rupees.
        assertEquals("₹1,49,900", MoneyFormat.format(14_990_000, "inr"));
        assertEquals("$149,900", MoneyFormat.format(14_990_000, "usd"));
    }

    @Test
    @DisplayName("says Free rather than a zero amount")
    void formatsNothingToPayAsFree() {
        assertEquals("Free", MoneyFormat.format(0, "inr"));
        assertEquals("Free", MoneyFormat.format(null, "inr"));
    }

    @Test
    @DisplayName("falls back to the currency code rather than guessing a symbol")
    void fallsBackToCurrencyCode() {
        // Wrong-looking, but never misleading - a made-up symbol could read as the wrong currency entirely.
        assertEquals("SEK 99", MoneyFormat.format(9_900, "sek"));
    }

    @Test
    @DisplayName("is case-insensitive about the currency code")
    void isCaseInsensitive() {
        assertEquals("₹499", MoneyFormat.format(49_900, "INR"));
    }
}
