import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TodayScreen } from '../screens/TodayScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { FundScreen } from '../screens/FundScreen';
import { RankScreen } from '../screens/RankScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SignInScreen } from '../screens/SignInScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { Colors, Shadows } from '../theme';
import { LogActivitySheet } from '../screens/LogActivitySheet';
import { GoogleUser } from '../hooks/useAuth';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function FABButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity style={fabStyles.container} onPress={onPress} activeOpacity={0.85}>
      <View style={fabStyles.button}>
        <Text style={fabStyles.icon}>＋</Text>
      </View>
    </TouchableOpacity>
  );
}

const fabStyles = StyleSheet.create({
  container: { top: -18, justifyContent: 'center', alignItems: 'center' },
  button: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.hero,
  },
  icon: { color: Colors.white, fontSize: 28, fontWeight: '300', lineHeight: 34 },
});

function MainTabs({ onFABPress }: { onFABPress: () => void }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.line,
          height: 58,
          paddingBottom: 6,
        },
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.faint,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tab.Screen
        name="Home"
        component={TodayScreen}
        options={{ title: 'Hôm nay', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text> }}
      />
      <Tab.Screen
        name="Analytics"
        component={ProgressScreen}
        options={{ title: 'Phân tích', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📊</Text> }}
      />
      <Tab.Screen
        name="Log"
        component={TodayScreen}
        options={{
          tabBarButton: () => <FABButton onPress={onFABPress} />,
          title: '',
        }}
        listeners={{ tabPress: (e) => e.preventDefault() }}
      />
      <Tab.Screen
        name="Fund"
        component={FundScreen}
        options={{ title: 'Quỹ', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💰</Text> }}
      />
      <Tab.Screen
        name="Rank"
        component={RankScreen}
        options={{ title: 'Hạng', tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏆</Text> }}
      />
    </Tab.Navigator>
  );
}

function AppStack({
  googleUser,
  onSignOut,
}: {
  googleUser: GoogleUser;
  onSignOut: () => Promise<void>;
}) {
  const [fabVisible, setFabVisible] = useState(false);

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs">
          {() => <MainTabs onFABPress={() => setFabVisible(true)} />}
        </Stack.Screen>
        <Stack.Screen
          name="Profile"
          options={{ presentation: 'modal', headerShown: true, title: 'Hồ sơ', headerTintColor: Colors.primary }}
        >
          {() => <ProfileScreen googleUser={googleUser} onSignOut={onSignOut} />}
        </Stack.Screen>
      </Stack.Navigator>
      <LogActivitySheet visible={fabVisible} onClose={() => setFabVisible(false)} />
    </>
  );
}

export function RootNavigator({
  isOnboarded,
  googleUser,
  onCompleteOnboarding,
  onSignInWithGoogle,
  onSignOut,
}: {
  isOnboarded: boolean;
  googleUser: GoogleUser | null;
  onCompleteOnboarding: () => Promise<void>;
  onSignInWithGoogle: (user: GoogleUser) => Promise<boolean>;
  onSignOut: () => Promise<void>;
}) {
  return (
    <NavigationContainer>
      {googleUser !== null && isOnboarded ? (
        <AppStack googleUser={googleUser} onSignOut={onSignOut} />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="SignIn">
            {({ navigation }) => (
              <SignInScreen
                onSignIn={() => navigation.navigate('Onboarding' as never)}
                onSignInWithGoogle={onSignInWithGoogle}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Onboarding">
            {() => <OnboardingScreen onComplete={onCompleteOnboarding} />}
          </Stack.Screen>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
