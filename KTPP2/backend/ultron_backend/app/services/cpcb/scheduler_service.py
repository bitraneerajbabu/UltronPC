"""UltrON — CPCB Scheduler Service

Orchestrates the full CPCB export pipeline:
  1. Compute 15-min averages
  2. Build CPCB records
  3. Export to file
  4. Maintain FIFO retention
  5. Log results
"""

from app.database import AsyncSessionLocal
from app.services.cpcb.average_service import run_cpcb_averaging
from app.services.cpcb.export_service import run_cpcb_export
from app.core.logger import get_logger

log = get_logger("ultron.cpcb.scheduler")


async def run_cpcb_pipeline():
    log.info("CPCB export pipeline starting...")
    async with AsyncSessionLocal() as db:
        try:
            avg_result = await run_cpcb_averaging(db)
            log.info(f"CPCB averaging: {avg_result}")

            export_result = await run_cpcb_export(db)
            log.info(f"CPCB export: {export_result}")

            await db.commit()
            log.info(f"CPCB pipeline complete: {export_result['total_records']} records exported")
        except Exception as e:
            await db.rollback()
            log.error(f"CPCB pipeline failed: {e}")
