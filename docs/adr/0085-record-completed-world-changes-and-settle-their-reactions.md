# Record completed world changes and settle their reactions

Accepted, 2026-10-31, following design review. This refines ADRs 0018, 0083 and 0084.

World Event recording belongs with each completed gameplay change in the Gameplay Session, across player actions, simulation, World Port commands and console changes. Two completed operations that undo each other still produce their events; temporary bookkeeping within one operation stays invisible. The existing event kinds and recipients remain unchanged.

Operations are grouped by their meaning in play, not by helper calls. A console relocation that first switches to the surface and then sets a position records the completed relocation, while two separate relocation commands remain two changes. Boarding, dropping and other compound actions follow the same rule. Meaningful simulation transitions, such as a Lift Journey changing scenes, remain distinct.

Script-caused World Events are delivered in ordered batches within the step that caused them, as ADR 0083 requires. A handler's World Port queries read current Session State, which may already include later changes in the batch: an event records what happened, not a historical world for the handler to query. Running scripts between every mutation or reconstructing historical state would change that contract and add coordination to each change. The Gameplay Session remains the sole state owner; the event record does not become an authoritative history.

One shared execution budget bounds the whole chain of reactions, including repeated short Talk Runs. Exhaustion stops simulation and automatic saving, exposes a diagnostic identifying the scripts and events involved, and preserves the last good Save. Unfinished reactions are not silently deferred to another step. This requires explicit runtime failure handling rather than relying on an exception to interrupt the browser's animation loop.

The budget counts Talk execution fuel and delivered events rather than elapsed wall time, so identical inputs have the same outcome on different machines. It spans all reaction batches within a simulation step; zero-time settlement before saving is bounded in the same way. Production thresholds are chosen conservatively during implementation, and tests exercise exhaustion with smaller limits. A failed Gameplay Session stays stopped and cannot be saved or continued. Menus and diagnostics remain available; recovery loads a settled Save or starts a New Game.

Before either a manual Save or Session Resume is captured, pending reactions settle without advancing simulation time. Snapshot capture itself remains read-only, and Saves contain settled state rather than a queue of unfinished World Events. A failure to settle prevents capture; restoring a Save emits no historical events.

The Gameplay Session owns recording and reaction settlement, with state writes and their recording kept together. The Browser Shell requests settlement before saving and presents its resulting effects, including sound and dialogue. It does not construct world observations, manage event queues or pump Talk Scripts. Internal composition may change, but no second owner of Session State is introduced.
