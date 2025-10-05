# Client-Side Physics Code Review

## File Reviewed
- `src/client/input/CollisionManager.ts`

## Overview
The `CollisionManager` encapsulates local-player physics, collision resolution against a static BVH-backed map and a set of dynamic colliders, coyote-time jump forgiveness, and projectile trajectory prediction utilities. The implementation leans heavily on `three-mesh-bvh` for efficient intersection testing and relies on sphere sweeping against triangle meshes rather than discrete ray tests.

## Strengths
- **Deterministic integration path:** Gravity, jump impulses, and horizontal movement now flow through a single frame velocity vector, eliminating the previous vertical damping while keeping player motion predictable.
- **Efficient BVH usage:** Static geometry is combined and cached in a global `MeshBVH`, and dynamic meshes register their BVHs once via `updateDynamicColliders`, removing the per-frame traversal overhead.
- **Iterative time-stepping:** Subdividing long frames until each slice is < 1/120s stabilizes physics under varying frame times.
- **Shared temporary objects:** Re-using vectors, spheres, and matrices reduces GC churn during collision passes and when sampling projectile trajectories.
- **Trajectory helper:** `createTrajectory` now advances position and velocity incrementally each step, yielding accurate bounce previews that match in-game physics.

## Recent Fixes
- Replaced the vertical velocity averaging with proper integration of gravity and jump impulses, restoring responsive air control.
- Defined jump, gravity, and coyote-time constants in seconds to ensure frame-rate independent behavior.
- Corrected penetration resolution by pushing the player out along the proper direction for both static and dynamic colliders.
- Cached dynamic collider meshes when `updateDynamicColliders` runs, avoiding costly scene graph traversals every frame and ensuring stale references are dropped when the list is refreshed.
- Guarded optional systems (`particleSystem`) before emission and reused temporary vectors when computing per-frame velocities to avoid needless allocations.

## Remaining Risks
1. **Ground snapping vs. sliding**  
   Collisions always zero the Y component when the contact normal exceeds the walkable threshold. Without tangential projection the player may stick slightly on sharp ramps. Consider projecting the horizontal velocity onto the collision plane to allow smoother sliding.
2. **Dynamic collider refresh cadence**  
   `updateDynamicColliders` must be called whenever prop meshes are spawned or destroyed. If a caller forgets, stale meshes will remain in `dynamicColliderEntries`. Documenting the expected lifecycle or adding an explicit `clearDynamicColliders` helper would reduce the risk.
3. **Trajectory allocation volume**  
   `createTrajectory` still allocates a new `THREE.Vector3` for every sampled point. For frequent previews, pooling vectors or exposing a callback-based sampler could reduce GC pressure.

## Suggestions
- Extend the collision response with optional plane projection to maintain horizontal speed when brushing against steep surfaces.
- Provide a small debug helper that visualizes the cached dynamic colliders and highlights when the registration list changes; this will make lifecycle issues easier to diagnose.
- If projectile previews become hot, add an object pool (or recycle the `points` array) to minimize allocations per frame.

## Conclusion
The updated physics loop resolves the prior damping, timing, and penetration issues, bringing jump arcs and collision response in line with the intended constants. The system is now easier to tune and maintains its BVH-backed efficiency, with only minor polish opportunities remaining around slide behavior and tooling.
