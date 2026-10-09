# Moving the site to serasona.com

Not done. It is blocked on a DNS change that cannot be made from this repo, and
the order matters — doing it in the wrong order takes the live site down.

## Where things stand

| Domain | DNS points at | Serves |
|---|---|---|
| `tryserasona.com` | GitHub Pages (`185.199.108-111.153`) | **the live app** |
| `serasona.com` | Squarespace (`198.185.159.x`, `198.49.23.x`) | a "Coming Soon" page |

`public/CNAME` therefore still says `tryserasona.com`. It was briefly changed to
`serasona.com` and reverted: GitHub Pages reads that file to set the repo's
custom domain, so publishing a domain whose DNS does not point at GitHub makes
Pages stop serving `tryserasona.com` without `serasona.com` ever starting. Both
domains go dark, and the only fix is another deploy.

## The order that works

1. **Squarespace DNS for `serasona.com`** → point it at GitHub Pages. Either the
   four A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`,
   `185.199.111.153`, or an ALIAS/CNAME to `bdo811.github.io`. Note that
   `amplifierhealth.com` and friends are administered in the **Squarespace**
   domain panel despite the nameservers reading `googledomains.com`.
2. Wait for `dig +short serasona.com` to return the GitHub addresses.
3. Change `public/CNAME` to `serasona.com`, push, and let the deploy run. Confirm
   the certificate goes green in repo Settings → Pages.
4. **Then** forward `tryserasona.com` → `serasona.com` in Squarespace.

Only step 3 is a code change. Steps 1, 2 and 4 are registrar work.

## Already done

Every Cloud Function CORS allowlist accepts `serasona.com` and `www.serasona.com`
today, so nothing has to be redeployed when the domain flips.

`tryserasona.com` stays in those allowlists deliberately. A browser following a
redirect still sends the *original* origin on the preflight, so removing it would
break anyone arriving on the old domain.
