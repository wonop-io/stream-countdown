# Stream Countdown

A broadcast-ready countdown for live streams, as a [Wonop](https://wonop.com) package.

- Large digits that count down to a start time in this machine's local time zone.
- From zero onward it shows "The stream starts now" and a live state. The date is
  fixed when it is set, so it never rolls over to tomorrow by itself.
- An optional promo line with a price and a crossed-out price.

Everything can be edited, so each new stream needs no code changes. In the window,
press **E** (or hover and click **Edit**). From a script:

```ts
await wm.apps["stream-countdown"].today({ time: "19:15" });
await wm.apps["stream-countdown"].configure({
  date: "2026-11-05", time: "18:30",
  title: "Live stream starts in", liveText: "The stream starts now",
  promoShow: true, promoText: "Buy Wonop at", promoUrl: "wonop.com",
  promoPrice: "$99", promoWas: "$299",
});
await wm.apps["stream-countdown"].state();
await wm.apps["stream-countdown"].reset();
```

Settings are kept in `app.store`, so they survive reloads and restarts. The package
needs no network, AI or secret permissions.

## Develop

```sh
deno task ci   # main.test.ts and the API check against runtime/
```

`runtime/`, `scripts/`, `deno.json`, `AGENTS.md` and `CLAUDE.md` are the Wonop
package kit. See `AGENTS.md`.
