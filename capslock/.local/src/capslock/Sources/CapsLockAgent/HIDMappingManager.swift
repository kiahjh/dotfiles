import Foundation
import IOKit
import IOKit.hid

struct HIDMappingStatus {
  let applied: Int
  let total: Int
  let failed: Int

  var isFullyApplied: Bool {
    total > 0 && applied == total && failed == 0
  }
}

struct HIDMappingChange {
  let changed: Int
  let status: HIDMappingStatus
}

struct HIDMappingManager {
  private typealias Mapping = [String: Any]

  private struct ManagedMapping {
    let source: UInt64
    let destination: UInt64

    var dictionary: Mapping {
      [
        kIOHIDKeyboardModifierMappingSrcKey: NSNumber(value: source),
        kIOHIDKeyboardModifierMappingDstKey: NSNumber(value: destination),
      ]
    }
  }

  private static let keyboardUsagePage = UInt64(kHIDPage_KeyboardOrKeypad) << 32
  private static let desiredMappings = [
    ManagedMapping(
      source: keyboardUsagePage | 0x39,  // Caps Lock
      destination: keyboardUsagePage | 0xE0  // Left Control
    ),
    ManagedMapping(
      source: keyboardUsagePage | 0x28,  // Return
      destination: keyboardUsagePage | 0xE4  // Right Control
    ),
    ManagedMapping(
      source: keyboardUsagePage | 0x33,  // Semicolon
      destination: keyboardUsagePage | 0x6D  // F18
    ),
  ]
  private static let managedSourceUsages = Set(desiredMappings.map(\.source))

  func apply() -> HIDMappingChange {
    updateManagedMappings(install: true)
  }

  func remove() -> HIDMappingChange {
    updateManagedMappings(install: false)
  }

  func status() -> HIDMappingStatus {
    withKeyboardServices { services in
      var applied = 0
      var failed = 0

      for service in services {
        guard let mappings = mappings(for: service) else {
          failed += 1
          continue
        }

        if hasAllDesiredMappings(mappings) {
          applied += 1
        }
      }

      return HIDMappingStatus(applied: applied, total: services.count, failed: failed)
    }
  }

  private func updateManagedMappings(install: Bool) -> HIDMappingChange {
    withKeyboardServices { services in
      var changed = 0
      var applied = 0
      var failed = 0

      for service in services {
        guard let existing = mappings(for: service) else {
          failed += 1
          continue
        }

        let withoutManagedMappings = existing.filter {
          guard let source = sourceUsage(in: $0) else { return true }
          return !Self.managedSourceUsages.contains(source)
        }
        let updated =
          install
          ? withoutManagedMappings + Self.desiredMappings.map(\.dictionary)
          : withoutManagedMappings

        let alreadyCorrect: Bool
        if install {
          alreadyCorrect =
            existing.count == withoutManagedMappings.count + Self.desiredMappings.count
            && hasAllDesiredMappings(existing)
        } else {
          alreadyCorrect = existing.count == withoutManagedMappings.count
        }

        if !alreadyCorrect {
          guard
            IOHIDServiceClientSetProperty(
              service,
              kIOHIDUserKeyUsageMapKey as CFString,
              updated as CFArray
            )
          else {
            failed += 1
            continue
          }
          changed += 1
        }

        if install ? hasAllDesiredMappings(updated) : hasNoManagedMappings(updated) {
          applied += 1
        }
      }

      return HIDMappingChange(
        changed: changed,
        status: HIDMappingStatus(applied: applied, total: services.count, failed: failed)
      )
    }
  }

  private func withKeyboardServices<Result>(
    _ body: ([IOHIDServiceClient]) -> Result
  ) -> Result {
    let client = IOHIDEventSystemClientCreateSimpleClient(kCFAllocatorDefault)
    let allServices = IOHIDEventSystemClientCopyServices(client) as? [IOHIDServiceClient] ?? []
    let keyboardServices = allServices.filter {
      IOHIDServiceClientConformsTo(
        $0,
        UInt32(kHIDPage_GenericDesktop),
        UInt32(kHIDUsage_GD_Keyboard)
      ) != 0
    }
    return body(keyboardServices)
  }

  private func mappings(for service: IOHIDServiceClient) -> [Mapping]? {
    guard
      let rawMappings = IOHIDServiceClientCopyProperty(
        service,
        kIOHIDUserKeyUsageMapKey as CFString
      )
    else {
      return []
    }

    return rawMappings as? [Mapping]
  }

  private func hasAllDesiredMappings(_ mappings: [Mapping]) -> Bool {
    Self.desiredMappings.allSatisfy { desired in
      mappings.contains {
        sourceUsage(in: $0) == desired.source
          && destinationUsage(in: $0) == desired.destination
      }
    }
  }

  private func hasNoManagedMappings(_ mappings: [Mapping]) -> Bool {
    mappings.allSatisfy {
      guard let source = sourceUsage(in: $0) else { return true }
      return !Self.managedSourceUsages.contains(source)
    }
  }

  private func sourceUsage(in mapping: Mapping) -> UInt64? {
    number(in: mapping, key: kIOHIDKeyboardModifierMappingSrcKey)?.uint64Value
  }

  private func destinationUsage(in mapping: Mapping) -> UInt64? {
    number(in: mapping, key: kIOHIDKeyboardModifierMappingDstKey)?.uint64Value
  }

  private func number(in mapping: Mapping, key: String) -> NSNumber? {
    mapping[key] as? NSNumber
  }
}
