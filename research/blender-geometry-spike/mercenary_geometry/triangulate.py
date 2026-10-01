"""Ear clipping in a polygon's dominant plane: the same rule as web/src/catalogue/geometry.ts.

Used only for the GLB candidate's display triangles, which standard glTF viewers draw. The
polygon loop in the MERCENARY_geometry extension stays the source of truth.
"""


def triangulate(points, loop):
    face = [i for k, i in enumerate(loop) if tuple(points[i]) != tuple(points[loop[k - 1]])]
    if len(face) < 3:
        return []
    normal = [0.0, 0.0, 0.0]
    for k in range(len(face)):
        a, b = points[face[k]], points[face[(k + 1) % len(face)]]
        normal[0] += (a[1] - b[1]) * (a[2] + b[2])
        normal[1] += (a[2] - b[2]) * (a[0] + b[0])
        normal[2] += (a[0] - b[0]) * (a[1] + b[1])
    magnitudes = [abs(n) for n in normal]
    drop = magnitudes.index(max(magnitudes))
    axes = [axis for axis in range(3) if axis != drop]
    flat = {i: (points[i][axes[0]], points[i][axes[1]]) for i in face}

    def cross(a, b, c):
        pa, pb, pc = flat[a], flat[b], flat[c]
        return (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pb[1] - pa[1]) * (pc[0] - pa[0])

    area = sum(flat[face[k]][0] * flat[face[(k + 1) % len(face)]][1] - flat[face[(k + 1) % len(face)]][0] * flat[face[k]][1] for k in range(len(face)))
    if abs(area) < 1e-9:
        return []
    sign = 1 if area > 0 else -1
    pending = list(face)
    result = []
    while len(pending) > 3:
        for k in range(len(pending)):
            a, b, c = pending[k - 1], pending[k], pending[(k + 1) % len(pending)]
            if cross(a, b, c) * sign <= 1e-9:
                continue
            if any(
                p not in (a, b, c)
                and cross(a, b, p) * sign >= -1e-9
                and cross(b, c, p) * sign >= -1e-9
                and cross(c, a, p) * sign >= -1e-9
                for p in pending
            ):
                continue
            result.extend((a, b, c))
            pending.pop(k)
            break
        else:
            # Display only: a fan keeps a non-simple polygon visible.
            result.extend(x for k in range(1, len(pending) - 1) for x in (pending[0], pending[k], pending[k + 1]))
            return result
    result.extend(pending)
    return result
