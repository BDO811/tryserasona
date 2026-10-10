# tryserasona.com redirect

This repository is not the Serasona app. The app lives in
[BDO811/serasona](https://github.com/BDO811/serasona) and is served at
**www.serasona.com**.

All this does is redirect `tryserasona.com` (and any path under it) to
www.serasona.com, preserving the path and query string.

It exists because Squarespace Domains, where tryserasona.com is registered,
has no URL-forwarding feature — its DNS panel offers records and presets only,
and DNS cannot express an HTTP redirect. Squarespace's forwarding is part of its
*website* product, which would mean paying for a site just to serve a redirect.
Something has to answer the request, and this is the smallest thing that can.

Pages is served from `main` at the root. There is no build.
