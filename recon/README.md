# Recon: amazon.com flows

Screenshots taken on 2026-10-02 while going through amazon.com's flows end to end: browsing and cart signed out, then orders, Buy Again and checkout signed in. No order was placed. **These were taken after the first build**, to check and sharpen the product decisions in the main [README](../README.md#product-decisions-what-i-changed-cut-and-kept). One of them corrected a claim I'd made (see 12).

Personal details (delivery location, account name in the header) are blurred where they appeared.

| # | Screenshot | What I noticed | What Bazario does |
|---|---|---|---|
| 01 | [Home](01-home.jpg) | Location popup ("Deliver to Pakistan") on first visit; big promotional carousels | Cut the location widget; home is category tiles plus top-rated products |
| 02 | [Search suggestions](02-search-suggestions.jpg) | Typing "iphne": suggestions are **text-only query completions** ("ipone 17 pro max case") | Suggestions are **products** with image and price, typo tolerant, so you can jump straight to the item |
| 03 | [Search results](03-search-results.jpg) | Shipping (PKR 12,508) is **bigger than the item price** (PKR 9,137) and shown in small print | Free shipping, and the price shown is the price paid |
| 04 | [Product buy box](04-product-buybox-prime-upsell.jpg) | "Prime Member Price" PKR 9,137 vs regular PKR 83,089, with **Join Prime** as the default action | No membership tiers or upsells in the buy box: one price, Add to Cart, Buy Now |
| 05 | [Buy box, regular price](05-buybox-countdown-and-import-fees.jpg) | **"Order within 18 mins"** countdown; PKR 84,302 shipping and import charges on top | Cut the countdown; stock line shows only real data ("Only N left") |
| 06 | [Added to cart (guest)](06-added-to-cart-guest.jpg) | Guests **can** add to cart without an account | Kept: guest cart, priced by the server, merged into the account at sign-in |
| 07 | [Cart (guest)](07-cart-page.jpg) | Dense, clear cart: quantity stepper, delete, save for later | Kept the layout: quantity, delete, live subtotal |
| 08 | [Checkout sign-in wall](08-checkout-sign-in-wall.jpg) | Checkout forces sign-in or account creation | Same point in the flow; our guest cart merges in automatically, so nothing is lost |
| 09 | [Your Orders](09-your-orders-signed-in.jpg) | Countdown banner in the nav ("4 days until Prime Big Deal Days") | No promotional countdowns |
| 10 | [Buy Again](10-buy-again-separate-page.jpg) | Buy Again is a **separate tab/page**, apart from the orders themselves | "Buy it again" on each past item and "Buy all again" per order, inside order history |
| 11 | [Cart (signed in)](11-cart-signed-in-upsells.jpg) | Signed in, the cart adds an Amazon Visa sign-up offer, a Prime trial, pay-in-4 financing and "also shopped for" | Cart shows only the cart |
| 12 | [Checkout](12-checkout-gated-sections.jpg) | **One page, but three gated sections** (address, then payment, then review); shipping and tax show "--" until an address is entered | One page with all fields open at once and the full total visible up front; server re-checks stock and price on submit |
