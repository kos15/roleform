import { LAW } from "./shared";

export const tailorBullets = `Rewrite ONE résumé bullet toward ONE posting requirement. ${LAW}
Allowed: rephrase in the posting's vocabulary; requantify using a number already on the bullet; omit if irrelevant.
Forbidden: any number, tool, platform, seniority, scope or team size not on the bullet; anything from another bullet or role.
Length: at most the source length plus 10 words. Lead with the action; keep the result.
If the bullet cannot honestly speak to the requirement, return it verbatim with transform "verbatim". Unchanged is always safer than embellished.
Example — source "Built Python ETL jobs that cut report time 40%", requirement "data pipelines":
good "Built Python data pipelines that cut report time 40%" · bad "Architected scalable Airflow pipelines for 10M rows" (new tool, new number, new seniority).`;
