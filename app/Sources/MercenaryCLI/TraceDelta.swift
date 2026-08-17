import Foundation

/// What changed between two readings of the same shape.
///
/// A trace writes its full state once, in its header, and afterwards only what moved.
/// The reason is the readable diff a trace exists to give: the game state carries
/// collections whose size dwarfs everything that changes — where all sixty-four objects
/// live, their rooms, their flag bytes, the interpreter's sixteen decimal registers —
/// and written in full on every step of a thirty-second run they are almost the whole
/// file and differ on a handful of lines.
///
/// The diff is recursive and structural, so it works the same for a record's fields as
/// for a slot-keyed map: one mechanism, because two would eventually disagree about what
/// "unchanged" means. ``applying(_:)`` is here beside it because reconstruction is half
/// the contract — a replay folds these forward, and a fold that did not exactly undo the
/// diff would report divergences the simulation never had.
extension TraceValue {
  /// The key a diff lists removed members under. Not a possible field name: every field
  /// in a trace is a name or a number.
  public static let removalKey = "-"

  /// What to write to turn `self` into `other`, or nil when nothing moved.
  ///
  /// Two objects diff member by member. Anything else that differs is written whole,
  /// because a partial update only means something for a shape whose members are named.
  public func changes(to other: TraceValue) -> TraceValue? {
    guard self != other else { return nil }
    guard case .object(let before) = self, case .object(let after) = other else { return other }

    let mine = Dictionary(before.map { ($0.key, $0.value) }, uniquingKeysWith: { _, last in last })
    var members: [(key: String, value: TraceValue)] = []
    for member in after {
      guard let existing = mine[member.key] else {
        members.append(member)
        continue
      }
      if let change = existing.changes(to: member.value) {
        members.append((key: member.key, value: change))
      }
    }
    let present = Set(after.map(\.key))
    let removed = before.map(\.key).filter { !present.contains($0) }.sorted()
    if !removed.isEmpty {
      members.append((key: Self.removalKey, value: .array(removed.map { .string($0) })))
    }
    return members.isEmpty ? nil : .object(members)
  }

  /// Fold a change forward, which is what a replay does with each record.
  public func applying(_ change: TraceValue) -> TraceValue {
    guard case .object(let mine) = self, case .object(let incoming) = change else { return change }

    var members = mine
    for member in incoming {
      if member.key == Self.removalKey {
        guard case .array(let keys) = member.value else { continue }
        let dropped = Set(
          keys.compactMap { key -> String? in
            guard case .string(let name) = key else { return nil }
            return name
          })
        members.removeAll { dropped.contains($0.key) }
        continue
      }
      guard let index = members.firstIndex(where: { $0.key == member.key }) else {
        members.append(member)
        continue
      }
      members[index] = (key: member.key, value: members[index].value.applying(member.value))
    }
    return .object(members)
  }
}
