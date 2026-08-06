---
topic: business
title: Business hub data
summary: Products, orders, customers, sales, content, marketing, support, analytics.
commands: [business]
---

# Business hub data

The project's own commerce and CRM records — the **same rows** the Orbit desktop
Business tab and workser-web's Business hub show. One generic CRUD surface across
every resource rather than a command per domain.

```
workser business resources                        # the known resource names
workser business list <resource> [subpath]        # list/read  (--query '<json>')
workser business get <resource> <id>
workser business create <resource> --body '<json>'
workser business update <resource> <id> --body '<json>'
workser business delete <resource> <id>
workser business action <resource> <id> <verb>    # POST .../<id>/<verb>
```

## Resources

`business-config`, `business-settings`, `products`, `collections`, `navigations`,
`orders`, `customers`, `sales-pipelines`, `sales-deals`, `pages`, `blog-posts`,
`media`, `campaigns`, `email-templates`, `discounts`, `seo-configs`,
`social-accounts`, `support-conversations`, `automation-rules`, `analytics`.

Run `workser business resources --json` rather than trusting this list — the CLI's
copy is the current one.

## Notes that matter

- **Sales and Support nest.** `sales-deals` maps to `/sales/deals`,
  `support-conversations` to `/support/conversations`. Use the dashed names above;
  the flat `resource/id` shape then works for `get`/`update`/`delete`/`action`.
- **`list` takes a raw subpath** for anything the map doesn't cover:
  `workser business list sales-pipelines <id>/stages`.
- **`action` is for named verbs** — `workser business action orders <id> cancel`,
  `workser business action sales-deals <dealId> win`. Check the resource's routes
  before inventing a verb.
- **These are real business records.** Cancelling an order or deleting a customer is
  not a dry run. Say what you're about to do first.

## This is for you, not for the app

`workser business` is how **you** inspect and fix data while building. The app reads
the same records at runtime through `workser.business` in `@workser/app` — see the
`workser-sdk` skill. An app shelling out to this CLI per request is wrong.
