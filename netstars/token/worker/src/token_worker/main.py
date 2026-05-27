"""
Token System worker · minimal entry point (stub for v0.1.0)

Real jobs (invoice generator, reconciler, usage aggregator, anomaly
detector, partition manager) per netstars/token/DESIGN.md §7 are not
implemented yet — this just runs a heartbeat loop so the container
stays up and proves the env wiring is correct.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal

import structlog

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger("token-worker")

WORKER_MODE = os.environ.get("WORKER_MODE", "all")
ENV = os.environ.get("ENV", "local")


async def heartbeat():
    counter = 0
    while True:
        counter += 1
        log.info("worker_heartbeat", mode=WORKER_MODE, counter=counter)
        await asyncio.sleep(30)


async def shutdown(signal_, loop):
    log.info("shutdown", signal=signal_.name)
    tasks = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    loop.stop()


async def main():
    loop = asyncio.get_running_loop()
    for s in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(s, lambda s=s: asyncio.create_task(shutdown(s, loop)))
    log.info("startup", env=ENV, mode=WORKER_MODE)
    # TODO: APScheduler instances for each job:
    #  - invoice_generator: cron '0 0 1 * *' (1st of month)
    #  - reconciler:        cron '0 * * * *' (hourly)
    #  - usage_aggregator:  interval seconds=300 (5min)
    #  - anomaly_detector:  interval seconds=300
    #  - partition_manager: cron '0 0 25 * *' (25th of month)
    await heartbeat()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
