import SwiftUI

struct RootView: View {
    @Environment(AuthService.self) private var auth
    @Environment(RecordingCoordinator.self) private var recorder

    var body: some View {
        Group {
            if auth.isSignedIn {
                MainTabs()
                    .task { await auth.refreshMe() }
            } else {
                SignInView()
            }
        }
        .fullScreenCover(isPresented: Binding(get: { recorder.isPresentingRecorder }, set: { recorder.isPresentingRecorder = $0 })) {
            RecordingView()
        }
    }
}

struct MainTabs: View {
    var body: some View {
        TabView {
            MeetingsListView()
                .tabItem { Label("Встречи", systemImage: "waveform.circle") }
            SettingsView()
                .tabItem { Label("Настройки", systemImage: "gearshape") }
        }
    }
}
