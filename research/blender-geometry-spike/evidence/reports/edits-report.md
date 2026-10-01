# Blender edit cases

Each case ran on both candidates: the `.blend` asset reopened, and the canonical GLB imported through the add-on.

| Case | Edit | As expected | Outcome |
| --- | --- | --- | --- |
| coffin-edits | Move a vertex, recolour the six-sided lid, delete a side face and re-add it, add and colour a line | yes | exported; .mgeo and .glb agree |
| coffin-uncoloured-line | Add and mark a line without giving it a colour | yes | rejected as expected: variant:record/l0: line v0–v3 has no palette colour; select it and use Mercenary ▸ Set Game Colour |
| coffin-unmarked-edge | Delete ▸ Only Faces, leaving an unmarked wire edge | yes | rejected as expected: variant:record/e3-4: wire edge v3–v4 is not a line: Mercenary ▸ Mark Lines (then Set Game Colour) to make it one, or delete it (Delete ▸ Only Faces leaves edges behind; Delete ▸ Faces does not) |
| atropos-remove-line | Remove the explicit line; its coincident-but-distinct face vertices stay distinct | yes | exported; .mgeo and .glb agree |
| ground-day-colour | Recolour a face to another day/night palette entry | yes | exported; .mgeo and .glb agree |
| spaceport-delete-referenced-face | Delete a plan face the region queues draw | yes | rejected as expected: structureSelection.regions[0].queue[20]: references source record 0 in plan, which no longer exists. Restore a primitive carrying it, or remap ref 20 in the sidecar to an existing target. |
| spaceport-rebuild-referenced-face | Delete that face, rebuild it with F and give it the same source record | yes | exported; .mgeo and .glb agree |
| spaceport-move-combined | Raise two vertices of the combined display variant by 300 | yes | exported; .mgeo and .glb agree |
| interior-delete-detail-record | Delete one palette variant’s face for a record the detail selection names | yes | rejected as expected: detailSelection[0].boxes[0].records[0]: references source record 30 in variant:*, which no longer exists. Restore a primitive carrying it, or remap ref 0 in the sidecar to an existing target. |
| surface-move-rotated | Drag a runtime-rotated vertex | yes | rejected as expected: wireframe/v0: moved, but it is a rotated input whose position the runtime computes; undo the move and change its mc_input attribute instead |
| surface-move-external | Drag a Road Workspace endpoint | yes | rejected as expected: wireframe/v62: moved, but it is a Road Workspace endpoint placed by the road table; it cannot be moved here |
| surface-move-structure | Raise the roof square; change one rotated input through its attribute | yes | exported; .mgeo and .glb agree |
| room-move-doorway-frame | Slide doorway 0’s frame along its wall | yes | exported; .mgeo and .glb agree |
| object-add-remove-lines | Remove one line and add another | yes | exported; .mgeo and .glb agree |
