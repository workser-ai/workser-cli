---
topic: data
title: Data from the web — scrapers, leads, reviews, social, SEO
summary: Paid data endpoints through Workser, with no API key — find one, see what it needs, run it; the full output goes to a file.
commands: [data]
---

# Data from the web

Hundreds of paid data endpoints — scrapers, lead and contact data, reviews,
social media, SEO, maps, jobs — through one command. Workser holds the key,
checks the project and charges its credits. **Never look for, ask for or use
an API key for any of this.**

Four steps, each small on purpose:

```
workser data find "tiktok videos about matcha this week"   # endpoints, one line each, with price
workser data inspect apify:/clockworks/tiktok-scraper       # what it needs
workser data run apify:/clockworks/tiktok-scraper --input '{"searchQueries":["matcha"],"resultsPerPage":20}'
workser data status <runId>                                 # a long run, later
```

- `find` answers with `provider:/endpoint` ids — pass the id as-is.
- `run` prints a short preview (status, result count, the first rows) and
  writes the **full output to a file** (`./workser-data/<runId>.json`, or
  `--out`). Read the file only for the parts you need.
- Ask for as few results as the task needs: many endpoints charge per result.
- An endpoint above the price limit is refused with its price — ask the owner
  before looking for a way around it. `insufficient_credit` means the project
  needs credits; tell the owner.
- A run that says the data source failed was not charged; try another endpoint.
