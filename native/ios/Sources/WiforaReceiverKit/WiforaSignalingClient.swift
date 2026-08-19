import Foundation

public protocol WiforaSignalingDelegate: AnyObject {
    func signalingClientDidConnect(_ client: WiforaSignalingClient)
    func signalingClientDidDisconnect(_ client: WiforaSignalingClient, error: Error?)
    func signalingClient(_ client: WiforaSignalingClient, didReceiveOffer sdp: String)
    func signalingClient(_ client: WiforaSignalingClient, didReceiveCandidate candidate: [String: Any])
    func signalingClient(_ client: WiforaSignalingClient, didReceiveClockReply reply: [String: Any])
    func signalingClient(_ client: WiforaSignalingClient, didReceiveAudioPolicy policy: [String: Any])
}

/// Native WebSocket client implementing the Wifora Control Protocol v1.
public final class WiforaSignalingClient: NSObject {
    public weak var delegate: WiforaSignalingDelegate?
    
    public let roomId: String
    public let sessionId: String
    public let deviceId: String
    public let token: String?
    
    private let serverURL: URL
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession?
    private var isConnected = false
    private var pendingCandidates: [[String: Any]] = []
    
    public init(serverURL: URL, roomId: String, sessionId: String = UUID().uuidString, deviceId: String = UUID().uuidString, token: String? = nil) {
        self.serverURL = serverURL
        self.roomId = roomId.uppercased()
        self.sessionId = sessionId
        self.deviceId = deviceId
        self.token = token
        super.init()
    }
    
    public func connect() {
        let configuration = URLSessionConfiguration.default
        session = URLSession(configuration: configuration, delegate: nil, delegateQueue: OperationQueue())
        webSocketTask = session?.webSocketTask(with: serverURL)
        webSocketTask?.resume()
        
        listenForMessages()
        registerAsListener()
    }
    
    public func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
    }
    
    public func sendClockProbe(clientSentAt: Double = Date().timeIntervalSince1970 * 1000) {
        let payload: [String: Any] = [
            "mode": "probe",
            "clientSentAt": clientSentAt
        ]
        sendControlMessage(type: "clock.sync", payload: payload)
    }
    
    public func sendTelemetryReport(rttMs: Double, jitterMs: Double, lossPercent: Double, playoutDelayMs: Double) {
        let payload: [String: Any] = [
            "rttMs": rttMs,
            "jitterMs": jitterMs,
            "lossPercent": lossPercent,
            "playoutDelayMs": playoutDelayMs
        ]
        sendControlMessage(type: "telemetry.report", payload: payload)
    }
    
    public func sendAnswer(sdp: String) {
        let message: [String: Any] = [
            "type": "answer",
            "sdp": ["type": "answer", "sdp": sdp]
        ]
        sendRawJSON(message)
    }
    
    public func sendCandidate(_ candidate: [String: Any]) {
        let message: [String: Any] = [
            "type": "candidate",
            "candidate": candidate
        ]
        sendRawJSON(message)
    }
    
    private func registerAsListener() {
        var registerMsg: [String: Any] = [
            "type": "register",
            "role": "listener",
            "roomId": roomId,
            "sessionId": sessionId,
            "deviceInfo": [
                "name": "iOS Native Receiver",
                "type": "phone",
                "platform": "iOS"
            ]
        ]
        if let token = token {
            registerMsg["listenerToken"] = token
        }
        sendRawJSON(registerMsg)
    }
    
    private func sendControlMessage(type: String, payload: [String: Any]) {
        let envelope: [String: Any] = [
            "type": type,
            "version": 1,
            "sessionId": sessionId,
            "deviceId": deviceId,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "payload": payload
        ]
        sendRawJSON(envelope)
    }
    
    private func sendRawJSON(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object),
              let jsonString = String(data: data, encoding: .utf8) else { return }
        webSocketTask?.send(.string(jsonString)) { _ in }
    }
    
    private func listenForMessages() {
        webSocketTask?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    self.handleIncomingText(text)
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        self.handleIncomingText(text)
                    }
                @unknown default:
                    break
                }
                self.listenForMessages()
            case .failure(let error):
                self.isConnected = false
                self.delegate?.signalingClientDidDisconnect(self, error: error)
            }
        }
    }
    
    private func handleIncomingText(_ text: String) {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = json["type"] as? String else { return }
        
        switch type {
        case "registered":
            isConnected = true
            delegate?.signalingClientDidConnect(self)
        case "offer":
            if let sdpDict = json["sdp"] as? [String: Any], let sdp = sdpDict["sdp"] as? String {
                delegate?.signalingClient(self, didReceiveOffer: sdp)
            }
        case "candidate":
            if let cand = json["candidate"] as? [String: Any] {
                delegate?.signalingClient(self, didReceiveCandidate: cand)
            }
        case "clock.sync":
            if let payload = json["payload"] as? [String: Any] {
                delegate?.signalingClient(self, didReceiveClockReply: payload)
            }
        case "audio.policy":
            if let payload = json["payload"] as? [String: Any] {
                delegate?.signalingClient(self, didReceiveAudioPolicy: payload)
            }
        default:
            break
        }
    }
}
