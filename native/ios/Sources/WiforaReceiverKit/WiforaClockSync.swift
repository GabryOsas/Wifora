import Foundation

public struct ClockSyncSnapshot {
    public let offsetMs: Double?
    public let rttMs: Double?
    public let driftPpm: Double
    public let correctionPpm: Double
    public let playbackRate: Double
    public let observations: Int
    public let rejectedObservations: Int
}

/// Swift implementation of the 4-timestamp NTP clock sync engine.
public final class WiforaClockSync {
    public let smoothing: Double
    public let maxRttMs: Double
    public let maxOffsetMs: Double
    public let maxCorrectionPpm: Double
    
    private var offsetMs: Double?
    private var rttMs: Double?
    private var driftPpm: Double = 0.0
    private var correctionPpm: Double = 0.0
    private var observations: Int = 0
    private var rejectedObservations: Int = 0
    private var lastReceivedAt: Double?
    
    public init(smoothing: Double = 0.2, maxRttMs: Double = 500.0, maxOffsetMs: Double = 10_000.0, maxCorrectionPpm: Double = 100.0) {
        self.smoothing = smoothing
        self.maxRttMs = maxRttMs
        self.maxOffsetMs = maxOffsetMs
        self.maxCorrectionPpm = maxCorrectionPpm
    }
    
    @discardableResult
    public func observeReply(clientSentAt: Double, hostReceivedAt: Double, hostSentAt: Double, clientReceivedAt: Double) -> ClockSyncSnapshot {
        let rtt = clientReceivedAt - clientSentAt - (hostSentAt - hostReceivedAt)
        let offset = (hostReceivedAt - clientSentAt + (hostSentAt - clientReceivedAt)) / 2.0
        
        if rtt < 0 || rtt > maxRttMs || abs(offset) > maxOffsetMs {
            rejectedObservations += 1
            return snapshot()
        }
        
        let prevOffset = offsetMs
        let prevReceivedAt = lastReceivedAt
        
        offsetMs = prevOffset == nil ? offset : prevOffset! + smoothing * (offset - prevOffset!)
        lastReceivedAt = clientReceivedAt
        
        if let prevOffset = prevOffset, let prevReceivedAt = prevReceivedAt, clientReceivedAt > prevReceivedAt {
            let instantPpm = ((offset - prevOffset) / (clientReceivedAt - prevReceivedAt)) * 1_000_000.0
            if instantPpm.isFinite && abs(instantPpm) <= 1_000.0 {
                driftPpm = observations <= 1 ? instantPpm : driftPpm + smoothing * (instantPpm - driftPpm)
            }
        }
        
        rttMs = rtt
        observations += 1
        correctionPpm = max(-maxCorrectionPpm, min(maxCorrectionPpm, driftPpm))
        return snapshot()
    }
    
    public func reset() {
        offsetMs = nil
        rttMs = nil
        driftPpm = 0.0
        correctionPpm = 0.0
        observations = 0
        rejectedObservations = 0
        lastReceivedAt = nil
    }
    
    public func snapshot() -> ClockSyncSnapshot {
        return ClockSyncSnapshot(
            offsetMs: offsetMs,
            rttMs: rttMs,
            driftPpm: driftPpm,
            correctionPpm: correctionPpm,
            playbackRate: 1.0 + (correctionPpm / 1_000_000.0),
            observations: observations,
            rejectedObservations: rejectedObservations
        )
    }
}
