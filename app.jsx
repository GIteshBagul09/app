import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc, getDocs, where, limit } from 'firebase/firestore';
import { Home, CalendarDays, BookText, Brain, User, Sun, Moon, PlusCircle, Trash2, Edit, Users, UserPlus, FileText, Search, MessageSquare, Link, Timer, Award, Zap, Shield, Upload, RotateCw, Settings, Send, Smile, Paperclip, Mic, XCircle, MessageSquareText } from 'lucide-react'; // Added MessageSquareText icon for group chat

// Context for Firebase and User
const AppContext = createContext(null);

// Firebase Configuration and Initialization
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

let app;
let db;
let auth;

// Initialize Firebase only once
if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
}

const AppProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState(null);
    const [profile, setProfile] = useState(null); // Stores full profile data
    const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
    const [needsClassGroupSetup, setNeedsClassGroupSetup] = useState(false);
    const [activeClassGroup, setActiveClassGroup] = useState(null); // Stores the currently active class group

    useEffect(() => {
        if (auth && db) {
            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (user) {
                    setCurrentUser(user);
                    setUserId(user.uid);

                    // Fetch user profile
                    const userProfileRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile`, 'public');
                    const profileSnap = await getDoc(userProfileRef);

                    if (profileSnap.exists()) {
                        setProfile(profileSnap.data());
                        setNeedsProfileSetup(false);

                        // Check if user is part of any class group and set activeClassGroup
                        const classGroupsRef = collection(db, `artifacts/${appId}/public/data/classGroups`);
                        const q = query(classGroupsRef, where("members", "array-contains", { uid: user.uid, displayName: profileSnap.data().displayName }));
                        const groupSnap = await getDocs(q);
                        if (!groupSnap.empty) {
                            setActiveClassGroup({ id: groupSnap.docs[0].id, ...groupSnap.docs[0].data() });
                            setNeedsClassGroupSetup(false);
                        } else {
                            setNeedsClassGroupSetup(true);
                        }
                    } else {
                        setProfile(null);
                        setNeedsProfileSetup(true); // Prompt for profile setup
                        setNeedsClassGroupSetup(false); // No group setup until profile is done
                    }

                    // Set up user presence (online status)
                    const userPresenceRef = doc(db, `artifacts/${appId}/public/data/userPresence`, user.uid);
                    await setDoc(userPresenceRef, {
                        uid: user.uid,
                        displayName: profileSnap.exists() ? profileSnap.data().displayName : 'Anonymous',
                        isOnline: true,
                        lastActive: new Date().toISOString()
                    }, { merge: true });

                    // Update lastActive every 15 seconds
                    const intervalId = setInterval(async () => {
                        await updateDoc(userPresenceRef, { lastActive: new Date().toISOString() });
                    }, 15000); // Update every 15 seconds

                    // Clean up interval on unmount/logout
                    return () => {
                        clearInterval(intervalId);
                        // Optionally set offline status on disconnect (more robust with Cloud Functions)
                        // For client-side, this is best-effort and might not always fire on sudden closes
                        updateDoc(userPresenceRef, { isOnline: false, lastActive: new Date().toISOString() });
                    };

                } else {
                    // Sign in anonymously if no initial auth token or user logs out
                    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                        try {
                            await signInWithCustomToken(auth, __initial_auth_token);
                        } catch (error) {
                            console.error("Error signing in with custom token:", error);
                            await signInAnonymously(auth); // Fallback to anonymous
                        }
                    } else {
                        await signInAnonymously(auth);
                    }
                    setProfile(null);
                    setNeedsProfileSetup(true); // After sign out, assume profile needs setup again for new user
                    setNeedsClassGroupSetup(false);
                    setActiveClassGroup(null);
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } else {
            setIsAuthReady(true); // If Firebase isn't configured, assume auth is ready
        }
    }, [auth, db, appId]);

    // Function to update profile
    const updateProfile = async (newProfileData) => {
        if (!db || !userId) return false;
        try {
            const userProfileRef = doc(db, `artifacts/${appId}/users/${userId}/profile`, 'public');
            await setDoc(userProfileRef, { ...newProfileData, lastUpdated: new Date().toISOString() }, { merge: true });
            setProfile(newProfileData);
            setNeedsProfileSetup(false);
            // Also update public user presence display name
            const userPresenceRef = doc(db, `artifacts/${appId}/public/data/userPresence`, userId);
            await setDoc(userPresenceRef, { displayName: newProfileData.displayName }, { merge: true });

            return true; // Indicate success
        } catch (error) {
            console.error("Error updating profile:", error);
            return false; // Indicate failure
        }
    };

    // Function to handle sign out
    const handleSignOut = async () => {
        try {
            if (auth) {
                if (userId) {
                    const userPresenceRef = doc(db, `artifacts/${appId}/public/data/userPresence`, userId);
                    await updateDoc(userPresenceRef, { isOnline: false, lastActive: new Date().toISOString() });
                }
                await signOut(auth);
                setCurrentUser(null);
                setUserId(null);
                setProfile(null);
                setNeedsProfileSetup(true);
                setNeedsClassGroupSetup(false);
                setActiveClassGroup(null);
            }
        } catch (error) {
            console.error("Error signing out:", error);
        }
    };

    return (
        <AppContext.Provider value={{ db, auth, currentUser, userId, isAuthReady, handleSignOut, appId, profile, needsProfileSetup, updateProfile, needsClassGroupSetup, setNeedsClassGroupSetup, activeClassGroup, setActiveClassGroup }}>
            {children}
        </AppContext.Provider>
    );
};

// Custom Hook to use App Context
const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};

// Message Modal Component
const MessageModal = ({ message, onClose }) => {
    if (!message) return null;
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full text-center">
                <p className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">{message}</p>
                <button
                    onClick={onClose}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                >
                    OK
                </button>
            </div>
        </div>
    );
};

// Profile Setup Modal Component
const ProfileSetupModal = ({ isOpen, onClose, onSave }) => {
    const { profile } = useAppContext();
    const [inputName, setInputName] = useState(profile?.displayName || '');
    const [schoolName, setSchoolName] = useState(profile?.schoolName || '');
    const [className, setClassName] = useState(profile?.className || '');
    const [board, setBoard] = useState(profile?.board || '');
    const [subjects, setSubjects] = useState(profile?.subjects || []);
    const [newSubject, setNewSubject] = useState('');
    const [role, setRole] = useState(profile?.role || 'Student'); // New state for role
    const [errorMessage, setErrorMessage] = useState('');

    // Subject suggestions based on class name
    const subjectSuggestionsMap = {
        '10th': ['Math', 'Science', 'Social Studies', 'English', 'Hindi'],
        '11th': ['Physics', 'Chemistry', 'Math', 'Biology', 'Computer Science', 'Economics', 'Business Studies', 'Accountancy'],
        '12th': ['Physics', 'Chemistry', 'Math', 'Biology', 'Computer Science', 'Economics', 'Business Studies', 'Accountancy'],
        // Add more mappings as needed
    };

    useEffect(() => {
        const lowerCaseClassName = className.toLowerCase();
        const suggested = subjectSuggestionsMap[lowerCaseClassName] || [];
        // Add suggested subjects if they are not already present
        const updatedSubjects = [...new Set([...subjects, ...suggested])];
        setSubjects(updatedSubjects);
    }, [className]); // Re-run when className changes

    const handleAddSubject = () => {
        if (newSubject.trim() && !subjects.includes(newSubject.trim())) {
            setSubjects([...subjects, newSubject.trim()]);
            setNewSubject('');
        }
    };

    const handleRemoveSubject = (subjectToRemove) => {
        setSubjects(subjects.filter(subject => subject !== subjectToRemove));
    };

    const handleSave = () => {
        if (inputName.trim() === '' || schoolName.trim() === '' || className.trim() === '' || board.trim() === '' || role.trim() === '') {
            setErrorMessage("All fields are required.");
            return;
        }
        onSave({
            displayName: inputName.trim(),
            schoolName: schoolName.trim(),
            className: className.trim(),
            board: board.trim(),
            subjects: subjects,
            role: role // Save the selected role
        });
        setErrorMessage('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full text-left my-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">Complete Your Profile</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-6 text-center">
                    Tell us a bit about yourself to get started!
                </p>

                <div className="mb-4 text-center">
                    <div className="w-24 h-24 bg-gray-200 dark:bg-gray-700 rounded-full mx-auto flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm mb-2">
                        <User size={40} />
                    </div>
                    <button className="text-indigo-600 dark:text-indigo-400 text-sm font-semibold hover:underline">
                        Upload Photo (Optional)
                    </button>
                </div>

                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                    Display Name:
                </label>
                <input
                    type="text"
                    placeholder="Your Name"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value)}
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                />

                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                    School/College Name:
                </label>
                <input
                    type="text"
                    placeholder="e.g., Central High School"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                />

                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                    Class Name:
                </label>
                <input
                    type="text"
                    placeholder="e.g., 10th, FY B.Sc."
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                />

                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                    Board/System:
                </label>
                <select
                    value={board}
                    onChange={(e) => setBoard(e.target.value)}
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                >
                    <option value="">Select Board/System</option>
                    <option value="CBSE">CBSE</option>
                    <option value="ICSE">ICSE</option>
                    <option value="State">State Board</option>
                    <option value="Other">Other</option>
                </select>

                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                    Role:
                </label>
                <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                >
                    <option value="Student">Student 👩‍🎓</option>
                    <option value="Monitor">Monitor 🧑‍💼</option>
                    <option value="Teacher">Teacher 👨‍🏫</option>
                </select>

                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                    Subjects:
                </label>
                <div className="flex mb-2">
                    <input
                        type="text"
                        placeholder="Add a subject (e.g., Math)"
                        value={newSubject}
                        onChange={(e) => setNewSubject(e.target.value)}
                        onKeyPress={(e) => { if (e.key === 'Enter') { handleAddSubject(); e.preventDefault(); } }}
                        className="flex-grow p-3 rounded-l-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                        onClick={handleAddSubject}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-r-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                    >
                        Add
                    </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-4">
                    {subjects.map((subject, index) => (
                        <span key={index} className="flex items-center bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 px-3 py-1 rounded-full text-sm">
                            {subject}
                            <button onClick={() => handleRemoveSubject(subject)} className="ml-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200">
                                &times;
                            </button>
                        </span>
                    ))}
                </div>


                {errorMessage && <p className="text-red-500 text-sm mb-4 text-center">{errorMessage}</p>}
                <div className="text-center">
                    <button
                        onClick={handleSave}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                    >
                        Save Profile
                    </button>
                </div>
            </div>
        </div>
    );
};

// First-Time Class Group Setup Modal
const FirstTimeClassGroupSetupModal = ({ isOpen, onClose }) => {
    const { db, userId, profile, appId, setNeedsClassGroupSetup, setActiveClassGroup } = useAppContext();
    const [groupName, setGroupName] = useState('');
    const [groupDescription, setGroupDescription] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('create'); // 'create' or 'join'

    const generateClassCode = (name, className, year) => {
        const namePart = name.replace(/\s/g, '').substring(0, 3).toUpperCase();
        const classPart = className.replace(/\s/g, '').substring(0, 3).toUpperCase();
        const yearPart = year.toString().slice(-2);
        const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${namePart}-${classPart}-${yearPart}-${randomPart}`;
    };

    const handleCreateGroup = async () => {
        if (!groupName.trim()) {
            setMessage("Class Group Name is required.");
            return;
        }
        if (!profile || !profile.displayName || !profile.className) {
            setMessage("Profile information (display name, class name) is missing. Please complete your profile first.");
            return;
        }
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }

        try {
            const generatedCode = generateClassCode(groupName, profile.className, new Date().getFullYear());
            const classGroupsCollectionRef = collection(db, `artifacts/${appId}/public/data/classGroups`);
            const newGroupRef = await addDoc(classGroupsCollectionRef, {
                name: groupName.trim(),
                description: groupDescription.trim(),
                classCode: generatedCode,
                createdBy: userId,
                createdByDisplayName: profile.displayName,
                members: [{ uid: userId, displayName: profile.displayName }],
                createdAt: new Date().toISOString(),
            });
            setActiveClassGroup({ id: newGroupRef.id, name: groupName.trim(), description: groupDescription.trim(), classCode: generatedCode, createdBy: userId, createdByDisplayName: profile.displayName, members: [{ uid: userId, displayName: profile.displayName }] });
            setMessage(`Class Group "${groupName}" created successfully! Share this code: ${generatedCode}`);
            setGroupName('');
            setGroupDescription('');
            setNeedsClassGroupSetup(false); // Mark as done
        } catch (e) {
            console.error("Error creating class group: ", e);
            setMessage("Failed to create class group. Please try again.");
        }
    };

    const handleJoinGroup = async () => {
        if (!joinCode.trim()) {
            setMessage("Please enter a Class Group Code.");
            return;
        }
        if (!profile || !profile.displayName) {
            setMessage("Profile information (display name) is missing. Please complete your profile first.");
            return;
        }
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }

        try {
            const classGroupsCollectionRef = collection(db, `artifacts/${appId}/public/data/classGroups`);
            const q = query(classGroupsCollectionRef, where("classCode", "==", joinCode.trim()));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setMessage("No class group found with that code.");
                return;
            }

            const groupDoc = querySnapshot.docs[0];
            const currentMembers = groupDoc.data().members || [];

            if (currentMembers.some(member => member.uid === userId)) {
                setMessage("You are already a member of this group.");
                setNeedsClassGroupSetup(false); // Mark as done
                setActiveClassGroup({ id: groupDoc.id, ...groupDoc.data() });
                return;
            }

            await updateDoc(doc(db, `artifacts/${appId}/public/data/classGroups`, groupDoc.id), {
                members: arrayUnion({ uid: userId, displayName: profile.displayName })
            });
            setActiveClassGroup({ id: groupDoc.id, ...groupDoc.data(), members: [...currentMembers, { uid: userId, displayName: profile.displayName }] });
            setMessage(`Successfully joined class group "${groupDoc.data().name}"!`);
            setJoinCode('');
            setNeedsClassGroupSetup(false); // Mark as done
        } catch (e) {
            console.error("Error joining class group: ", e);
            setMessage("Failed to join class group. Please check the code.");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full text-left my-8">
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-4 text-center">Create or Join Your Class Group</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-6 text-center">
                    Connect with your classmates to share notes, events, and more!
                </p>

                <div className="flex justify-center mb-6">
                    <button
                        onClick={() => setActiveTab('create')}
                        className={`px-6 py-2 rounded-l-md font-semibold ${activeTab === 'create' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                    >
                        Create Group
                    </button>
                    <button
                        onClick={() => setActiveTab('join')}
                        className={`px-6 py-2 rounded-r-md font-semibold ${activeTab === 'join' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}
                    >
                        Join Group
                    </button>
                </div>

                {activeTab === 'create' ? (
                    <>
                        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                            Class Group Name:
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., 10-A Science Batch"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                        />
                        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                            Description (optional):
                        </label>
                        <textarea
                            placeholder="Brief description of your class group"
                            value={groupDescription}
                            onChange={(e) => setGroupDescription(e.target.value)}
                            rows="3"
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                        ></textarea>
                        <div className="text-center">
                            <button
                                onClick={handleCreateGroup}
                                className="px-8 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                            >
                                Create Class Group
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                            Enter Class Group Code:
                        </label>
                        <input
                            type="text"
                            placeholder="e.g., ABC-XYZ-23-1234"
                            value={joinCode}
                            onChange={(e) => setJoinCode(e.target.value)}
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                        />
                        <div className="text-center">
                            <button
                                onClick={handleJoinGroup}
                                className="px-8 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                            >
                                Join Class Group
                            </button>
                        </div>
                    </>
                )}

                {message && <p className="text-red-500 text-sm mt-4 text-center">{message}</p>}
                <div className="text-center mt-6">
                    <button
                        onClick={() => setNeedsClassGroupSetup(false)}
                        className="text-gray-600 dark:text-gray-400 text-sm hover:underline"
                    >
                        Skip for now
                    </button>
                </div>
            </div>
        </div>
    );
};


// Home Component
const HomePage = ({ setActiveTab }) => { // Receive setActiveTab as prop
    const { userId, profile } = useAppContext();
    return (
        <div className="p-6 flex flex-col items-center justify-center h-full text-center">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Welcome to ClassSync X!</h1>
            <p className="text-xl text-gray-700 dark:text-gray-300 mb-8">Your Class, Synced. Your Study, Simplified.</p>
            {profile?.displayName && (
                <p className="text-lg text-indigo-600 dark:text-indigo-400 mb-4">Hello, {profile.displayName}!</p>
            )}
            {userId && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Your User ID: <span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded-md break-all">{userId.substring(0, 8)}...</span>
                </p>
            )}
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
                <FeatureCard icon={<CalendarDays size={28} />} title="Class Calendar" description="Manage tests, assignments & deadlines." onClick={() => setActiveTab('calendar')} />
                <FeatureCard icon={<BookText size={28} />} title="Notes Hub" description="Upload, organize & share notes." onClick={() => setActiveTab('notes')} />
                <FeatureCard icon={<Brain size={28} />} title="AI Doubt Solver" description="Instant explanations for your questions." onClick={() => setActiveTab('ai')} />
                <FeatureCard icon={<Users size={28}/>} title="Peer Match" description="Find study partners and groups." onClick={() => setActiveTab('class-groups')} />
                <FeatureCard icon={<Award size={28}/>} title="Class Leaderboard" description="See top performers in your class." onClick={() => setActiveTab('progress-tracker')} /> {/* Linked to Progress Tracker for now */}
                <FeatureCard icon={<Zap size={28}/>} title="Flashcard of the Day" description="Quick daily revision." onClick={() => setActiveTab('flashcards')} />
            </div>
        </div>
    );
};

const FeatureCard = ({ icon, title, description, onClick }) => (
    <button
        onClick={onClick}
        className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 flex flex-col items-center text-center cursor-pointer"
    >
        <div className="text-indigo-600 dark:text-indigo-400 mb-4">{icon}</div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-gray-600 dark:text-gray-400 text-sm">{description}</p>
    </button>
);

// Calendar Component
const CalendarPage = () => {
    const { db, userId, isAuthReady, appId, profile, activeClassGroup } = useAppContext();
    const [events, setEvents] = useState([]);
    const [newEvent, setNewEvent] = useState({ title: '', date: '', description: '', type: 'Assignment', subject: '' });
    const [editingEvent, setEditingEvent] = useState(null);
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (db && userId && isAuthReady && activeClassGroup) {
            const eventsCollectionRef = collection(db, `artifacts/${appId}/public/data/classGroups/${activeClassGroup.id}/calendarEvents`);
            const q = query(eventsCollectionRef, orderBy('date'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const eventsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setEvents(eventsData.sort((a, b) => new Date(a.date) - new Date(b.date)));
            }, (error) => {
                console.error("Error fetching events:", error);
                setMessage("Failed to load calendar events.");
            });

            return () => unsubscribe();
        } else if (isAuthReady && !activeClassGroup) {
            setMessage("Please join a class group to view and add calendar events.");
            setEvents([]);
        }
    }, [db, userId, isAuthReady, appId, activeClassGroup]);

    const handleAddEvent = async () => {
        if (!activeClassGroup) {
            setMessage("Please join a class group before adding events.");
            return;
        }
        if (!newEvent.title || !newEvent.date || !newEvent.subject) {
            setMessage("Title, Date, and Subject are required for a new event.");
            return;
        }
        if (!db || !userId || !profile) {
            setMessage("Database not initialized, user not authenticated, or profile missing.");
            return;
        }

        try {
            const eventsCollectionRef = collection(db, `artifacts/${appId}/public/data/classGroups/${activeClassGroup.id}/calendarEvents`);
            await addDoc(eventsCollectionRef, {
                ...newEvent,
                createdAt: new Date().toISOString(),
                createdBy: userId,
                createdByDisplayName: profile.displayName,
                creatorRole: profile.role,
            });
            setNewEvent({ title: '', date: '', description: '', type: 'Assignment', subject: '' });
            setMessage("Event added successfully!");
        } catch (e) {
            console.error("Error adding document: ", e);
            setMessage("Failed to add event.");
        }
    };

    const handleDeleteEvent = async (id, createdBy) => {
        if (!activeClassGroup) {
            setMessage("No active class group.");
            return;
        }
        if (!db || !userId || !profile) {
            setMessage("Database not initialized, user not authenticated, or profile missing.");
            return;
        }
        if (userId !== createdBy && profile.role !== 'Teacher') {
            setMessage("You do not have permission to delete this event.");
            return;
        }
        try {
            const eventDocRef = doc(db, `artifacts/${appId}/public/data/classGroups/${activeClassGroup.id}/calendarEvents`, id);
            await deleteDoc(eventDocRef);
            setMessage("Event deleted successfully!");
        } catch (e) {
            console.error("Error deleting document: ", e);
            setMessage("Failed to delete event.");
        }
    };

    const handleEditClick = (event) => {
        setEditingEvent({ ...event });
    };

    const handleUpdateEvent = async () => {
        if (!activeClassGroup) {
            setMessage("No active class group.");
            return;
        }
        if (!editingEvent.title || !editingEvent.date || !editingEvent.subject) {
            setMessage("Title, Date, and Subject are required for an event.");
            return;
        }
        if (!db || !userId || !profile) {
            setMessage("Database not initialized, user not authenticated, or profile missing.");
            return;
        }
        if (userId !== editingEvent.createdBy && profile.role !== 'Teacher') {
            setMessage("You do not have permission to edit this event.");
            return;
        }
        try {
            const eventDocRef = doc(db, `artifacts/${appId}/public/data/classGroups/${activeClassGroup.id}/calendarEvents`, editingEvent.id);
            await updateDoc(eventDocRef, {
                title: editingEvent.title,
                date: editingEvent.date,
                description: editingEvent.description,
                type: editingEvent.type,
                subject: editingEvent.subject,
                updatedAt: new Date().toISOString(),
            });
            setEditingEvent(null);
            setMessage("Event updated successfully!");
        } catch (e) {
            console.error("Error updating document: ", e);
            setMessage("Failed to update event.");
        }
    };

    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Class Calendar & Reminders</h2>

            {activeClassGroup ? (
                <p className="text-lg text-indigo-600 dark:text-indigo-400 mb-4">
                    Events for: <span className="font-semibold">{activeClassGroup.name}</span>
                </p>
            ) : (
                <p className="text-lg text-red-500 dark:text-red-400 mb-4">
                    You need to join a class group to use the shared calendar.
                </p>
            )}

            {/* Reminder Note */}
            <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 p-4 rounded-md mb-6 shadow-sm">
                <p className="font-semibold mb-2">Note on Reminders:</p>
                <p className="text-sm">
                    This calendar helps you track important dates. For real-time push notifications or smart alerts, a backend service would be required, which is beyond the scope of this client-side application.
                </p>
            </div>


            {/* Add/Edit Event Form */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                    {editingEvent ? 'Edit Event' : 'Add New Event'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <input
                        type="text"
                        placeholder="Event Title"
                        value={editingEvent ? editingEvent.title : newEvent.title}
                        onChange={(e) => editingEvent ? setEditingEvent({ ...editingEvent, title: e.target.value }) : setNewEvent({ ...newEvent, title: e.target.value })}
                        className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                        type="date"
                        value={editingEvent ? editingEvent.date : newEvent.date}
                        onChange={(e) => editingEvent ? setEditingEvent({ ...editingEvent, date: e.target.value }) : setNewEvent({ ...newEvent, date: e.target.value })}
                        className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <select
                        value={editingEvent ? editingEvent.type : newEvent.type}
                        onChange={(e) => editingEvent ? setEditingEvent({ ...editingEvent, type: e.target.value }) : setNewEvent({ ...newEvent, type: e.target.value })}
                        className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="Assignment">Assignment</option>
                        <option value="Test">Test</option>
                        <option value="Goal">Daily Goal</option>
                        <option value="Other">Other</option>
                    </select>
                    <input
                        type="text"
                        placeholder="Subject Tag (e.g., Math, Physics)"
                        value={editingEvent ? editingEvent.subject : newEvent.subject}
                        onChange={(e) => editingEvent ? setEditingEvent({ ...editingEvent, subject: e.target.value }) : setNewEvent({ ...newEvent, subject: e.target.value })}
                        className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>
                <textarea
                    placeholder="Description (optional)"
                    value={editingEvent ? editingEvent.description : newEvent.description}
                    onChange={(e) => editingEvent ? setEditingEvent({ ...editingEvent, description: e.target.value }) : setNewEvent({ ...newEvent, description: e.target.value })}
                    rows="3"
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                ></textarea>
                <div className="flex justify-end space-x-2">
                    {editingEvent ? (
                        <>
                            <button
                                onClick={handleUpdateEvent}
                                className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                            >
                                <Edit size={20} className="mr-2" /> Update Event
                            </button>
                            <button
                                onClick={() => setEditingEvent(null)}
                                className="px-6 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200"
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleAddEvent}
                            className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                        >
                            <PlusCircle size={20} className="mr-2" /> Add Event
                        </button>
                    )}
                </div>
            </div>

            {/* Events List */}
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Upcoming Events</h3>
            {events.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">No events scheduled yet. Add one above!</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {events.map((event) => (
                        <div key={event.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md flex flex-col">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{event.title}</h4>
                            <p className="text-indigo-600 dark:text-indigo-400 text-sm mb-1">Type: {event.type} | Subject: {event.subject}</p>
                            <p className="text-indigo-600 dark:text-indigo-400 text-sm mb-2">{new Date(event.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            {event.description && <p className="text-gray-700 dark:text-gray-300 text-sm mb-3 flex-grow">{event.description}</p>}
                            <p className="text-xs text-gray-500 dark:text-gray-400">Created by: {event.createdByDisplayName || 'Unknown'} ({event.creatorRole || 'Student'})</p>
                            <div className="flex justify-end space-x-2 mt-auto">
                                {(userId === event.createdBy || profile?.role === 'Teacher') && (
                                    <>
                                        <button
                                            onClick={() => handleEditClick(event)}
                                            className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                                            title="Edit Event"
                                        >
                                            <Edit size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteEvent(event.id, event.createdBy)}
                                            className="p-2 rounded-full text-red-600 hover:bg-red-100 dark:hover:bg-red-900 transition-colors duration-200"
                                            title="Delete Event"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};

// Notes Component
const NotesPage = () => {
    const { db, userId, isAuthReady, appId } = useAppContext();
    const [notes, setNotes] = useState([]);
    const [newNote, setNewNote] = useState({ title: '', subject: '', content: '', tags: '', type: 'text', fileName: '' });
    const [selectedFile, setSelectedFile] = useState(null); // New state for file
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSubject, setFilterSubject] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (db && userId && isAuthReady) {
            // Private notes for each user
            const notesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/notes`);
            let q = query(notesCollectionRef, orderBy('createdAt', 'desc'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const notesData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setNotes(notesData);
            }, (error) => {
                console.error("Error fetching notes:", error);
                setMessage("Failed to load notes.");
            });

            return () => unsubscribe();
        }
    }, [db, userId, isAuthReady, appId]);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
            setNewNote(prev => ({ ...prev, fileName: file.name, type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.includes('pdf') ? 'pdf' : 'doc' }));
        } else {
            setSelectedFile(null);
            setNewNote(prev => ({ ...prev, fileName: '', type: 'text' }));
        }
    };

    const handleAddNote = async () => {
        if (!newNote.title || !newNote.subject || (!newNote.content && !selectedFile)) {
            setMessage("Title, Subject, and Content/File are required for a new note.");
            return;
        }
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }

        try {
            const notesCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/notes`);
            const noteData = {
                ...newNote,
                createdAt: new Date().toISOString(),
                createdBy: userId,
            };

            // Placeholder for file upload logic
            if (selectedFile) {
                // In a real app, you would upload selectedFile to Firebase Storage here
                // and save the download URL in noteData.fileURL
                console.log("Simulating file upload:", selectedFile.name);
                noteData.fileURL = `simulated-url-for-${selectedFile.name}`;
                noteData.content = `[File: ${selectedFile.name}]`; // Update content to reflect file
            }

            await addDoc(notesCollectionRef, noteData);
            setNewNote({ title: '', subject: '', content: '', tags: '', type: 'text', fileName: '' });
            setSelectedFile(null); // Clear selected file
            setMessage("Note added successfully!");
        } catch (e) {
            console.error("Error adding document: ", e);
            setMessage("Failed to add note.");
        }
    };

    const handleDeleteNote = async (id) => {
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }
        try {
            const noteDocRef = doc(db, `artifacts/${appId}/users/${userId}/notes`, id);
            await deleteDoc(noteDocRef);
            setMessage("Note deleted successfully!");
        } catch (e) {
            console.error("Error deleting document: ", e);
            setMessage("Failed to delete note.");
        }
    };

    const filteredNotes = notes.filter(note => {
        const matchesSearch = note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              note.tags.toLowerCase().includes(searchTerm.toLowerCase()) ||
                              note.fileName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSubject = filterSubject === '' || note.subject.toLowerCase() === filterSubject.toLowerCase();
        return matchesSearch && matchesSubject;
    });

    // Get unique subjects for filter dropdown
    const uniqueSubjects = [...new Set(notes.map(note => note.subject))];

    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Notes & Resource Hub</h2>

            {/* Add New Note Form */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Add New Note</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <input
                        type="text"
                        placeholder="Note Title"
                        value={newNote.title}
                        onChange={(e) => setNewNote({ ...newNote, title: e.target.value })}
                        className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                        type="text"
                        placeholder="Subject (e.g., Math, Physics)"
                        value={newNote.subject}
                        onChange={(e) => setNewNote({ ...newNote, subject: e.target.value })}
                        className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                        type="text"
                        placeholder="Tags (comma-separated)"
                        value={newNote.tags}
                        onChange={(e) => setNewNote({ ...newNote, tags: e.target.value })}
                        className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    {/* File Input */}
                    <div className="flex items-center p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus-within:ring-indigo-500 focus-within:border-indigo-500">
                        <label htmlFor="file-upload" className="cursor-pointer flex items-center">
                            <Upload size={20} className="mr-2 text-gray-600 dark:text-gray-400" />
                            <span className="text-sm">
                                {selectedFile ? selectedFile.name : 'Upload File (PDF, Image, Audio, Doc)'}
                            </span>
                        </label>
                        <input
                            id="file-upload"
                            type="file"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </div>
                </div>
                <textarea
                    placeholder="Note Content (optional, if file uploaded)"
                    value={newNote.content}
                    onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                    rows="5"
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                ></textarea>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    Note: File uploads are simulated. For actual storage, Firebase Storage integration would be required.
                </p>
                <div className="flex justify-end">
                    <button
                        onClick={handleAddNote}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                    >
                        <PlusCircle size={20} className="mr-2" /> Add Note
                    </button>
                </div>
            </div>

            {/* Search and Filter */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8 flex flex-col md:flex-row gap-4">
                <input
                    type="text"
                    placeholder="Search notes by title, content, tags, or filename..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="flex-grow p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                />
                <select
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                >
                    <option value="">All Subjects</option>
                    {uniqueSubjects.map((subject, index) => (
                        <option key={index} value={subject}>{subject}</option>
                    ))}
                </select>
            </div>

            {/* Notes List */}
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Your Notes</h3>
            {filteredNotes.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">No notes found matching your criteria.</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredNotes.map((note) => (
                        <div key={note.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md flex flex-col">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{note.title}</h4>
                            <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-3">{note.subject} {note.tags && `(${note.tags})`} {note.type && `[${note.type.toUpperCase()}]`}</p>
                            {note.fileName && <p className="text-gray-700 dark:text-gray-300 text-sm mb-1">File: {note.fileName}</p>}
                            <p className="text-gray-700 dark:text-gray-300 text-sm mb-3 flex-grow line-clamp-3">{note.content}</p>
                            <div className="flex justify-end mt-auto">
                                <button
                                    onClick={() => handleDeleteNote(note.id)}
                                    className="p-2 rounded-full text-red-600 hover:bg-red-100 dark:hover:bg-red-900 transition-colors duration-200"
                                    title="Delete Note"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};

// AI Doubt Solver Component (Functional)
const AIDoubtSolverPage = () => {
    const [doubtText, setDoubtText] = useState('');
    const [aiResponse, setAiResponse] = useState('');
    const [isLoadingAI, setIsLoadingAI] = useState(false);
    const [message, setMessage] = useState('');

    const askAIDoubt = async () => {
        if (!doubtText.trim()) {
            setMessage("Please type your doubt before asking the AI.");
            return;
        }

        setIsLoadingAI(true);
        setAiResponse(''); // Clear previous response
        setMessage('');

        try {
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: doubtText }] });
            const payload = { contents: chatHistory };
            const apiKey = "" // If you want to use models other than gemini-2.0-flash or imagen-3.0-generate-002, provide an API key here. Otherwise, leave this as-is.
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                setAiResponse(text);
            } else {
                setMessage("AI could not generate a response. Please try again.");
                console.error("Unexpected AI response structure:", result);
            }
        } catch (error) {
            console.error("Error calling Gemini API:", error);
            setMessage("Failed to connect to AI. Please check your network or try again later.");
        } finally {
            setIsLoadingAI(false);
        }
    };

    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">AI Doubt Solver</h2>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Ask Your Doubt</h3>
                <textarea
                    placeholder="Type your question here..."
                    value={doubtText}
                    onChange={(e) => setDoubtText(e.target.value)}
                    rows="6"
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                ></textarea>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    (Image input for doubts is a future enhancement.)
                </p>
                <div className="flex justify-end">
                    <button
                        onClick={askAIDoubt}
                        disabled={isLoadingAI}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200 shadow-lg flex items-center justify-center"
                    >
                        {isLoadingAI ? (
                            <svg className="animate-spin h-5 w-5 text-white mr-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : (
                            <Brain size={20} className="mr-2" />
                        )}
                        {isLoadingAI ? 'Thinking...' : 'Ask AI a Doubt'}
                    </button>
                </div>
            </div>

            {aiResponse && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">AI Response:</h3>
                    <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 max-h-96 overflow-y-auto"> {/* Added max-h and overflow */}
                        {aiResponse.split('\n').map((line, index) => (
                            <p key={index}>{line}</p>
                        ))}
                    </div>
                </div>
            )}
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};

// Group Chat Page Component
const GroupChatPage = ({ activeClassGroup, setSelectedGroupChat, setActiveTab }) => {
    const { db, userId, profile, appId } = useAppContext();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [message, setMessage] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (!db || !activeClassGroup?.id) {
            setMessage("No active class group selected for chat.");
            return;
        }

        const groupMessagesRef = collection(db, `artifacts/${appId}/public/data/classGroups/${activeClassGroup.id}/groupMessages`);
        const q = query(groupMessagesRef, orderBy('timestamp'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
        }, (error) => {
            console.error("Error fetching group messages:", error);
            setMessage("Failed to load group messages.");
        });

        return () => unsubscribe();
    }, [db, activeClassGroup, appId]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!newMessage.trim()) {
            setMessage("Message cannot be empty.");
            return;
        }
        if (!db || !userId || !profile || !activeClassGroup) {
            setMessage("Chat not initialized correctly.");
            return;
        }

        try {
            const groupMessagesRef = collection(db, `artifacts/${appId}/public/data/classGroups/${activeClassGroup.id}/groupMessages`);
            await addDoc(groupMessagesRef, {
                senderId: userId,
                senderDisplayName: profile.displayName,
                text: newMessage.trim(),
                timestamp: new Date().toISOString(),
            });
            setNewMessage('');
        } catch (e) {
            console.error("Error sending group message: ", e);
            setMessage("Failed to send message.");
        }
    };

    if (!activeClassGroup) {
        return (
            <div className="p-6 flex flex-col items-center justify-center h-full text-center">
                <MessageSquareText size={64} className="text-gray-400 mb-6" />
                <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-4">No Group Chat Selected</h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Go to "Class Groups" and click "Group Chat" to start chatting with your classmates.
                </p>
                <button
                    onClick={() => setActiveTab('class-groups')}
                    className="mt-6 px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200"
                >
                    View Class Groups
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
            {/* Group Chat Header */}
            <div className="bg-white dark:bg-gray-800 shadow-sm p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                <button onClick={() => setSelectedGroupChat(null)} className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">
                    <XCircle size={24} />
                </button>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Group Chat: {activeClassGroup.name}
                </h3>
                <div className="w-6"></div> {/* Placeholder for alignment */}
            </div>

            {/* Messages Area */}
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}
                    >
                        <div className={`max-w-[70%] p-3 rounded-lg shadow-md ${
                            msg.senderId === userId
                                ? 'bg-indigo-600 text-white rounded-br-none'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none'
                        }`}>
                            <p className="text-xs font-semibold mb-1">
                                {msg.senderId === userId ? 'You' : msg.senderDisplayName}
                            </p>
                            <p className="text-sm break-words">{msg.text}</p>
                            <p className="text-xs text-right mt-1 opacity-75">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white dark:bg-gray-800 p-4 border-t border-gray-200 dark:border-gray-700 flex items-center space-x-2">
                <input
                    type="text"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                    className="flex-grow p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                    onClick={handleSendMessage}
                    className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                >
                    <Send size={24} />
                </button>
            </div>
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};


// Class Groups Component (Renamed from StudyGroupsPage)
const ClassGroupsPage = ({ setActiveTab, setSelectedChatUser, setSelectedGroupChat }) => {
    const { db, userId, profile, isAuthReady, appId, setActiveClassGroup, activeClassGroup } = useAppContext();
    const [groups, setGroups] = useState([]);
    const [newGroup, setNewGroup] = useState({ name: '', description: '' });
    const [message, setMessage] = useState('');
    const [memberToAddId, setMemberToAddId] = useState('');
    const [joinCodeInput, setJoinCodeInput] = useState(''); // New state for direct join code input
    const [userPresence, setUserPresence] = useState({}); // To store online status

    useEffect(() => {
        if (db && userId && isAuthReady) {
            const classGroupsCollectionRef = collection(db, `artifacts/${appId}/public/data/classGroups`);
            const q = query(classGroupsCollectionRef, orderBy('createdAt', 'desc'));

            const unsubscribeGroups = onSnapshot(q, (snapshot) => {
                const groupsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setGroups(groupsData);
            }, (error) => {
                console.error("Error fetching groups:", error);
                setMessage("Failed to load class groups.");
            });

            // Listen for user presence updates
            const userPresenceRef = collection(db, `artifacts/${appId}/public/data/userPresence`);
            const unsubscribePresence = onSnapshot(userPresenceRef, (snapshot) => {
                const presenceData = {};
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    // Consider user online if lastActive is within the last 30 seconds
                    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
                    presenceData[doc.id] = data.isOnline && data.lastActive > thirtySecondsAgo;
                });
                setUserPresence(presenceData);
            }, (error) => {
                console.error("Error fetching user presence:", error);
            });


            return () => {
                unsubscribeGroups();
                unsubscribePresence();
            };
        }
    }, [db, userId, isAuthReady, appId]);

    const handleCreateGroup = async () => {
        if (!newGroup.name) {
            setMessage("Group Name is required.");
            return;
        }
        if (!profile || !profile.displayName) {
            setMessage("Please complete your profile first (display name required).");
            return;
        }
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }

        try {
            const generatedCode = `${newGroup.name.replace(/\s/g, '').substring(0, 3).toUpperCase()}-${profile.className.replace(/\s/g, '').substring(0, 3).toUpperCase()}-${new Date().getFullYear().toString().slice(-2)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

            const classGroupsCollectionRef = collection(db, `artifacts/${appId}/public/data/classGroups`);
            const newGroupRef = await addDoc(classGroupsCollectionRef, {
                name: newGroup.name.trim(),
                description: newGroup.description.trim(),
                classCode: generatedCode,
                createdBy: userId,
                createdByDisplayName: profile.displayName,
                members: [{ uid: userId, displayName: profile.displayName }],
                createdAt: new Date().toISOString(),
            });
            setActiveClassGroup({ id: newGroupRef.id, name: newGroup.name.trim(), description: newGroup.description.trim(), classCode: generatedCode, createdBy: userId, createdByDisplayName: profile.displayName, members: [{ uid: userId, displayName: profile.displayName }] });
            setMessage(`Class Group "${newGroup.name}" created successfully! Code: ${generatedCode}`);
            setNewGroup({ name: '', description: '' });
        } catch (e) {
            console.error("Error creating group: ", e);
            setMessage("Failed to create class group.");
        }
    };

    const handleJoinGroup = async (groupId, currentMembers, groupData) => {
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }
        if (!profile || !profile.displayName) {
            setMessage("Please complete your profile first (display name required).");
            return;
        }
        const isAlreadyMember = currentMembers.some(member => member.uid === userId);
        if (isAlreadyMember) {
            setMessage("You are already a member of this group.");
            setActiveClassGroup({ id: groupId, ...groupData });
            return;
        }
        try {
            const groupDocRef = doc(db, `artifacts/${appId}/public/data/classGroups`, groupId);
            await updateDoc(groupDocRef, {
                members: arrayUnion({ uid: userId, displayName: profile.displayName })
            });
            setActiveClassGroup({ id: groupId, ...groupData, members: [...currentMembers, { uid: userId, displayName: profile.displayName }] });
            setMessage("Joined group successfully!");
        } catch (e) {
            console.error("Error joining group: ", e);
            setMessage("Failed to join group.");
        }
    };

    const handleLeaveGroup = async (groupId, currentMembers) => {
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }
        const memberToRemove = currentMembers.find(member => member.uid === userId);
        if (!memberToRemove) {
            setMessage("You are not a member of this group.");
            return;
        }
        try {
            const groupDocRef = doc(db, `artifacts/${appId}/public/data/classGroups`, groupId);
            await updateDoc(groupDocRef, {
                members: arrayRemove(memberToRemove)
            });
            if (activeClassGroup && activeClassGroup.id === groupId) {
                setActiveClassGroup(null); // Clear active group if leaving it
            }
            setMessage("Left group successfully!");
        } catch (e) {
            console.error("Error leaving group: ", e);
            setMessage("Failed to leave group.");
        }
    };

    const handleDeleteGroup = async (groupId, createdBy) => {
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }
        if (userId !== createdBy) {
            setMessage("Only the creator can delete this group.");
            return;
        }
        try {
            const groupDocRef = doc(db, `artifacts/${appId}/public/data/classGroups`, groupId);
            await deleteDoc(groupDocRef);
            if (activeClassGroup && activeClassGroup.id === groupId) {
                setActiveClassGroup(null); // Clear active group if deleting it
            }
            setMessage("Group deleted successfully!");
        } catch (e) {
            console.error("Error deleting group: ", e);
            setMessage("Failed to delete group.");
        }
    };

    const handleAddMemberToGroup = async (groupId, currentMembers) => {
        if (!db || !userId || !memberToAddId.trim()) {
            setMessage("Please enter a User ID to add.");
            return;
        }
        if (!profile || !profile.displayName) {
            setMessage("Please complete your profile first (display name required).");
            return;
        }
        if (memberToAddId === userId) {
            setMessage("You cannot add yourself to the group this way.");
            setMemberToAddId('');
            return;
        }
        if (currentMembers.some(member => member.uid === memberToAddId)) {
            setMessage("This user is already a member of the group.");
            setMemberToAddId('');
            return;
        }

        try {
            const targetUserProfileRef = doc(db, `artifacts/${appId}/users/${memberToAddId}/profile`, 'public');
            const targetProfileSnap = await getDoc(targetUserProfileRef);

            if (!targetProfileSnap.exists() || !targetProfileSnap.data().displayName) {
                setMessage("User not found or they haven't set a display name.");
                return;
            }

            const targetUserDisplayName = targetProfileSnap.data().displayName;

            const groupDocRef = doc(db, `artifacts/${appId}/public/data/classGroups`, groupId);
            await updateDoc(groupDocRef, {
                members: arrayUnion({ uid: memberToAddId, displayName: targetUserDisplayName })
            });
            setMessage(`Successfully added ${targetUserDisplayName} to the group!`);
            setMemberToAddId('');
        } catch (e) {
            console.error("Error adding member to group: ", e);
            setMessage("Failed to add member. Please check the User ID.");
        }
    };

    const handleDirectJoinGroup = async () => {
        if (!joinCodeInput.trim()) {
            setMessage("Please enter a Class Group Code.");
            return;
        }
        if (!profile || !profile.displayName) {
            setMessage("Please complete your profile first (display name required).");
            return;
        }
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }

        try {
            const classGroupsCollectionRef = collection(db, `artifacts/${appId}/public/data/classGroups`);
            const q = query(classGroupsCollectionRef, where("classCode", "==", joinCodeInput.trim()));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setMessage("No class group found with that code.");
                return;
            }

            const groupDoc = querySnapshot.docs[0];
            const currentMembers = groupDoc.data().members || [];

            if (currentMembers.some(member => member.uid === userId)) {
                setMessage("You are already a member of this group.");
                setJoinCodeInput('');
                setActiveClassGroup({ id: groupDoc.id, ...groupDoc.data() });
                return;
            }

            await updateDoc(doc(db, `artifacts/${appId}/public/data/classGroups`, groupDoc.id), {
                members: arrayUnion({ uid: userId, displayName: profile.displayName })
            });
            setActiveClassGroup({ id: groupDoc.id, ...groupDoc.data(), members: [...currentMembers, { uid: userId, displayName: profile.displayName }] });
            setMessage(`Successfully joined class group "${groupDoc.data().name}"!`);
            setJoinCodeInput('');
        } catch (e) {
            console.error("Error joining class group: ", e);
            setMessage("Failed to join class group. Please check the code.");
        }
    };

    const handleChatWithMember = (memberUid, memberDisplayName) => {
        setSelectedChatUser({ uid: memberUid, displayName: memberDisplayName });
        setActiveTab('chat');
    };

    const handleGroupChatClick = (group) => {
        setSelectedGroupChat(group);
        setActiveTab('group-chat');
    };


    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Class Groups</h2>

            {/* Create New Group Form */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Create New Class Group</h3>
                <input
                    type="text"
                    placeholder="Class Group Name"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                />
                <textarea
                    placeholder="Description (optional)"
                    value={newGroup.description}
                    onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                    rows="3"
                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                ></textarea>
                <div className="flex justify-end">
                    <button
                        onClick={handleCreateGroup}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                    >
                        <PlusCircle size={20} className="mr-2" /> Create Group
                    </button>
                </div>
            </div>

            {/* Direct Join Group Form */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Join Class Group by Code</h3>
                <div className="flex gap-2 mb-4">
                    <input
                        type="text"
                        placeholder="Enter Class Group Code"
                        value={joinCodeInput}
                        onChange={(e) => setJoinCodeInput(e.target.value)}
                        className="flex-grow p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <button
                        onClick={handleDirectJoinGroup}
                        className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                    >
                        Join
                    </button>
                </div>
            </div>

            {/* Class Groups List */}
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Available Class Groups</h3>
            {groups.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">No class groups available yet. Create one!</p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groups.map((group) => (
                        <div key={group.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md flex flex-col">
                            <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{group.name}</h4>
                            {group.description && <p className="text-gray-700 dark:text-gray-300 text-sm mb-2 flex-grow">{group.description}</p>}
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                Code: <span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded-md text-xs">{group.classCode}</span>
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                Members:
                                <ul className="list-disc list-inside ml-4">
                                    {group.members && group.members.map(member => (
                                        <li key={member.uid} className="flex items-center text-gray-700 dark:text-gray-300 text-sm">
                                            <span className={`mr-2 ${userPresence[member.uid] ? 'text-green-500' : 'text-gray-400'}`}>
                                                {userPresence[member.uid] ? '✅' : '⚪'}
                                            </span>
                                            {member.displayName || member.uid.substring(0, 8) + '...'}
                                            {member.uid !== userId && (
                                                <button
                                                    onClick={() => handleChatWithMember(member.uid, member.displayName)}
                                                    className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-md text-xs hover:bg-blue-200 dark:hover:bg-blue-800"
                                                >
                                                    Chat
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                Created by: <span className="font-mono break-all">{group.createdByDisplayName || group.createdBy.substring(0, 8) + '...'}</span>
                            </p>
                            <div className="flex justify-between items-center mt-auto">
                                {group.members && group.members.some(member => member.uid === userId) ? (
                                    <>
                                        <button
                                            onClick={() => handleLeaveGroup(group.id, group.members)}
                                            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors duration-200 text-sm"
                                        >
                                            Leave Group
                                        </button>
                                        <button
                                            onClick={() => handleGroupChatClick(group)}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors duration-200 text-sm flex items-center"
                                        >
                                            <MessageSquareText size={16} className="mr-1" /> Group Chat
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        onClick={() => handleJoinGroup(group.id, group.members || [], group)}
                                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200 text-sm"
                                    >
                                        Join Group
                                    </button>
                                )}
                                {userId === group.createdBy && (
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => handleDeleteGroup(group.id, group.createdBy)}
                                            className="p-2 rounded-full text-red-600 hover:bg-red-100 dark:hover:bg-red-900 transition-colors duration-200"
                                            title="Delete Group"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            {userId === group.createdBy && (
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <h5 className="text-md font-semibold text-gray-900 dark:text-white mb-2">Add Member by User ID:</h5>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            placeholder="Classmate's User ID"
                                            value={memberToAddId}
                                            onChange={(e) => setMemberToAddId(e.target.value)}
                                            className="flex-grow p-2 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                        />
                                        <button
                                            onClick={() => handleAddMemberToGroup(group.id, group.members || [])}
                                            className="p-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200 flex items-center justify-center"
                                            title="Add Member"
                                        >
                                            <UserPlus size={20} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};


// Profile Component
const ProfilePage = ({ setActiveTab }) => { // Receive setActiveTab as prop
    const { currentUser, userId, isAuthReady, handleSignOut, profile, updateProfile } = useAppContext();
    const [editMode, setEditMode] = useState(false);
    const [newProfileData, setNewProfileData] = useState(profile || {});
    const [message, setMessage] = useState('');

    useEffect(() => {
        setNewProfileData(profile || {}); // Update when profile from context changes
    }, [profile]);

    const handleAddSubject = () => {
        if (newProfileData.newSubject.trim() && !(newProfileData.subjects || []).includes(newProfileData.newSubject.trim())) {
            setNewProfileData(prev => ({
                ...prev,
                subjects: [...(prev.subjects || []), newProfileData.newSubject.trim()],
                newSubject: ''
            }));
        }
    };

    const handleRemoveSubject = (subjectToRemove) => {
        setNewProfileData(prev => ({
            ...prev,
            subjects: (prev.subjects || []).filter(subject => subject !== subjectToRemove)
        }));
    };

    const handleSaveProfile = async () => {
        if (!newProfileData.displayName || !newProfileData.schoolName || !newProfileData.className || !newProfileData.board || !newProfileData.role) {
            setMessage("Display Name, School, Class, Board, and Role are required.");
            return;
        }
        const success = await updateProfile(newProfileData);
        if (success) {
            setMessage("Profile updated successfully!");
            setEditMode(false);
        } else {
            setMessage("Failed to update profile.");
        }
    };

    if (!isAuthReady) {
        return (
            <div className="flex justify-center items-center h-full">
                <p className="text-gray-600 dark:text-gray-400">Loading user data...</p>
            </div>
        );
    }

    return (
        <div className="p-6 flex flex-col items-center h-full text-center">
            <User size={64} className="text-indigo-600 dark:text-indigo-400 mb-6" />
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Your Profile</h2>
            {currentUser ? (
                <>
                    <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
                        You are logged in {currentUser.isAnonymous ? 'anonymously' : `as ${currentUser.email || 'an authenticated user'}`}.
                    </p>
                    {userId && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            Your User ID: <span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded-md break-all">{userId}</span>
                        </p>
                    )}

                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md w-full max-w-md mb-8 text-left">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Profile Details</h3>
                        {editMode ? (
                            <div className="flex flex-col gap-4">
                                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold">Display Name:</label>
                                <input
                                    type="text"
                                    value={newProfileData.displayName || ''}
                                    onChange={(e) => setNewProfileData(prev => ({ ...prev, displayName: e.target.value }))}
                                    className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold">School/College:</label>
                                <input
                                    type="text"
                                    value={newProfileData.schoolName || ''}
                                    onChange={(e) => setNewProfileData(prev => ({ ...prev, schoolName: e.target.value }))}
                                    className="p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold">Class Name:</label>
                                <input
                                    type="text"
                                    value={newProfileData.className || ''}
                                    onChange={(e) => setNewProfileData(prev => ({ ...prev, className: e.target.value }))}
                                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold">Board/System:</label>
                                <select
                                    value={newProfileData.board || ''}
                                    onChange={(e) => setNewProfileData(prev => ({ ...prev, board: e.target.value }))}
                                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                                >
                                    <option value="">Select Board/System</option>
                                    <option value="CBSE">CBSE</option>
                                    <option value="ICSE">ICSE</option>
                                    <option value="State">State Board</option>
                                    <option value="Other">Other</option>
                                </select>
                                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold">Role:</label>
                                <select
                                    value={newProfileData.role || 'Student'}
                                    onChange={(e) => setNewProfileData(prev => ({ ...prev, role: e.target.value }))}
                                    className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                                >
                                    <option value="Student">Student 👩‍🎓</option>
                                    <option value="Monitor">Monitor 🧑‍💼</option>
                                    <option value="Teacher">Teacher 👨‍🏫</option>
                                </select>
                                <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold">Subjects:</label>
                                <div className="flex">
                                    <input
                                        type="text"
                                        placeholder="Add a subject"
                                        value={newProfileData.newSubject || ''}
                                        onChange={(e) => setNewProfileData(prev => ({ ...prev, newSubject: e.target.value }))}
                                        onKeyPress={(e) => { if (e.key === 'Enter') { handleAddSubject(); e.preventDefault(); } }}
                                        className="flex-grow p-3 rounded-l-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                                    <button
                                        onClick={handleAddSubject}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-r-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                                    >
                                        Add
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {(newProfileData.subjects || []).map((subject, index) => (
                                        <span key={index} className="flex items-center bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 px-3 py-1 rounded-full text-sm">
                                            {subject}
                                            <button onClick={() => handleRemoveSubject(subject)} className="ml-2 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200">
                                                &times;
                                            </button>
                                        </span>
                                    ))}
                                </div>

                                <div className="flex justify-end space-x-2 mt-4">
                                    <button
                                        onClick={handleSaveProfile}
                                        className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200"
                                    >
                                        Save
                                    </button>
                                    <button
                                        onClick={() => { setEditMode(false); setNewProfileData(profile); }}
                                        className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors duration-200"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <p className="text-lg text-gray-800 dark:text-gray-200 mb-2">
                                    <span className="font-semibold">Name:</span> {profile?.displayName || 'Not set'}
                                </p>
                                <p className="text-md text-gray-700 dark:text-gray-300 mb-2">
                                    <span className="font-semibold">School:</span> {profile?.schoolName || 'Not set'}
                                </p>
                                <p className="text-md text-gray-700 dark:text-gray-300 mb-2">
                                    <span className="font-semibold">Class:</span> {profile?.className || 'Not set'}
                                </p>
                                <p className="text-md text-gray-700 dark:text-gray-300 mb-2">
                                    <span className="font-semibold">Board:</span> {profile?.board || 'Not set'}
                                </p>
                                <p className="text-md text-gray-700 dark:text-gray-300 mb-2">
                                    <span className="font-semibold">Role:</span> {profile?.role || 'Not set'}
                                </p>
                                <p className="text-md text-gray-700 dark:text-gray-300 mb-4">
                                    <span className="font-semibold">Subjects:</span> {(profile?.subjects || []).join(', ') || 'Not set'}
                                </p>
                                <div className="flex justify-end">
                                    <button
                                        onClick={() => setEditMode(true)}
                                        className="p-2 rounded-full text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                                        title="Edit Profile"
                                    >
                                        <Edit size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Settings Section */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md w-full max-w-md mb-8 text-left">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Settings</h3>
                        <p className="text-gray-700 dark:text-gray-300">
                            Account settings, notification preferences, privacy controls, etc., would be configured here.
                        </p>
                        <button
                            onClick={() => setActiveTab('settings')} // Navigate to settings page
                            className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200 flex items-center"
                        >
                            <Settings size={18} className="mr-2"/> Manage Settings
                        </button>
                    </div>

                    <button
                        onClick={handleSignOut}
                        className="px-6 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-200"
                    >
                        Sign Out
                    </button>
                </>
            ) : (
                <p className="text-lg text-gray-700 dark:text-gray-300">
                    Not authenticated. Attempting anonymous sign-in...
                </p>
            )}
            <div className="mt-8 text-gray-600 dark:text-gray-400 text-sm">
                <p>More profile features like roles (Student, Monitor, Teacher) and settings would be implemented here.</p>
            </div>
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};

// Flashcards Page (Functional)
const FlashcardsPage = () => {
    const { db, userId, isAuthReady, appId, profile } = useAppContext();
    const [flashcards, setFlashcards] = useState([]);
    const [newFlashcard, setNewFlashcard] = useState({ front: '', back: '', subject: '' });
    const [message, setMessage] = useState('');
    const [currentTestCardIndex, setCurrentTestCardIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [inTestMode, setInTestMode] = useState(false);
    const [testCards, setTestCards] = useState([]);

    useEffect(() => {
        if (db && userId && isAuthReady) {
            const flashcardsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/flashcards`);
            const q = query(flashcardsCollectionRef, orderBy('createdAt', 'desc'));

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const cardsData = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setFlashcards(cardsData);
            }, (error) => {
                console.error("Error fetching flashcards:", error);
                setMessage("Failed to load flashcards.");
            });

            return () => unsubscribe();
        }
    }, [db, userId, isAuthReady, appId]);

    const handleAddFlashcard = async () => {
        if (!newFlashcard.front.trim() || !newFlashcard.back.trim() || !newFlashcard.subject.trim()) {
            setMessage("Front, Back, and Subject are required for a new flashcard.");
            return;
        }
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }

        try {
            const flashcardsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/flashcards`);
            await addDoc(flashcardsCollectionRef, {
                ...newFlashcard,
                createdAt: new Date().toISOString(),
                createdBy: userId,
            });
            setNewFlashcard({ front: '', back: '', subject: '' });
            setMessage("Flashcard added successfully!");
        } catch (e) {
            console.error("Error adding document: ", e);
            setMessage("Failed to add flashcard.");
        }
    };

    const handleDeleteFlashcard = async (id) => {
        if (!db || !userId) {
            setMessage("Database not initialized or user not authenticated.");
            return;
        }
        try {
            const flashcardDocRef = doc(db, `artifacts/${appId}/users/${userId}/flashcards`, id);
            await deleteDoc(flashcardDocRef);
            setMessage("Flashcard deleted successfully!");
        } catch (e) {
            console.error("Error deleting document: ", e);
            setMessage("Failed to delete flashcard.");
        }
    };

    const startQuickTest = () => {
        if (flashcards.length === 0) {
            setMessage("Please add some flashcards before starting a test!");
            return;
        }
        // Shuffle flashcards for the test
        const shuffledCards = [...flashcards].sort(() => Math.random() - 0.5);
        setTestCards(shuffledCards);
        setCurrentTestCardIndex(0);
        setIsFlipped(false);
        setInTestMode(true);
        setMessage('');
    };

    const flipCard = () => {
        setIsFlipped(!isFlipped);
    };

    const nextCard = () => {
        if (currentTestCardIndex < testCards.length - 1) {
            setCurrentTestCardIndex(currentTestCardIndex + 1);
            setIsFlipped(false); // Flip back to front for next card
        } else {
            setMessage("You've completed all flashcards in this test!");
            setInTestMode(false);
        }
    };

    const currentTestCard = testCards[currentTestCardIndex];
    const uniqueSubjects = [...new Set(flashcards.map(card => card.subject))];


    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Flashcards & Quick Tests</h2>

            {inTestMode ? (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8 text-center">
                    <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Quick Test</h3>
                    {currentTestCard ? (
                        <>
                            <div
                                className={`relative w-full max-w-sm mx-auto h-48 bg-indigo-100 dark:bg-indigo-900 rounded-lg shadow-lg flex items-center justify-center p-4 cursor-pointer transition-transform duration-500 transform ${isFlipped ? 'rotate-y-180' : ''}`}
                                onClick={flipCard}
                                style={{ transformStyle: 'preserve-3d' }}
                            >
                                <div className={`absolute inset-0 flex items-center justify-center backface-hidden ${isFlipped ? 'opacity-0' : 'opacity-100'}`}>
                                    <p className="text-xl font-bold text-indigo-800 dark:text-indigo-200">{currentTestCard.front}</p>
                                </div>
                                <div className={`absolute inset-0 flex items-center justify-center backface-hidden rotate-y-180 ${isFlipped ? 'opacity-100' : 'opacity-0'}`}>
                                    <p className="text-lg text-indigo-700 dark:text-indigo-300">{currentTestCard.back}</p>
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Click card to flip</p>
                            <p className="text-md text-gray-700 dark:text-gray-300 mt-4">Card {currentTestCardIndex + 1} of {testCards.length}</p>
                            <div className="flex justify-center space-x-4 mt-6">
                                <button
                                    onClick={nextCard}
                                    className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                                >
                                    Next Card <RotateCw size={20} className="ml-2" />
                                </button>
                                <button
                                    onClick={() => setInTestMode(false)}
                                    className="px-6 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200"
                                >
                                    End Test
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="text-lg text-gray-700 dark:text-gray-300">Test completed or no cards available.</p>
                    )}
                </div>
            ) : (
                <>
                    {/* Add New Flashcard Form */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Add New Flashcard</h3>
                        <input
                            type="text"
                            placeholder="Front of Card (e.g., Question, Term)"
                            value={newFlashcard.front}
                            onChange={(e) => setNewFlashcard({ ...newFlashcard, front: e.target.value })}
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                        />
                        <input
                            type="text"
                            placeholder="Back of Card (e.g., Answer, Definition)"
                            value={newFlashcard.back}
                            onChange={(e) => setNewFlashcard({ ...newFlashcard, back: e.target.value })}
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                        />
                        <input
                            type="text"
                            placeholder="Subject (e.g., Math, History)"
                            value={newFlashcard.subject}
                            onChange={(e) => setNewFlashcard({ ...newFlashcard, subject: e.target.value })}
                            className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                        />
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={handleAddFlashcard}
                                className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                            >
                                <PlusCircle size={20} className="mr-2" /> Add Flashcard
                            </button>
                            <button
                                onClick={startQuickTest}
                                className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                            >
                                <Zap size={20} className="mr-2" /> Start Quick Test
                            </button>
                        </div>
                    </div>

                    {/* Flashcards List */}
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Your Flashcards</h3>
                    {flashcards.length === 0 ? (
                        <p className="text-gray-600 dark:text-gray-400">You haven't added any flashcards yet.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {flashcards.map((card) => (
                                <div key={card.id} className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md flex flex-col">
                                    <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-1">{card.front}</h4>
                                    <p className="text-gray-700 dark:text-gray-300 text-sm mb-3 flex-grow">{card.back}</p>
                                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3">Subject: {card.subject}</p>
                                    <div className="flex justify-end mt-auto">
                                        <button
                                            onClick={() => handleDeleteFlashcard(card.id)}
                                            className="p-2 rounded-full text-red-600 hover:bg-red-100 dark:hover:bg-red-900 transition-colors duration-200"
                                            title="Delete Flashcard"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};

// Progress Tracker Page (Functional)
const ProgressTrackerPage = () => {
    const { profile } = useAppContext();
    const [message, setMessage] = useState('');

    // Mock progress data for demonstration
    const mockProgress = profile?.subjects?.map(subject => ({
        subject: subject,
        progress: Math.floor(Math.random() * 100) // Random progress for now
    })) || [];

    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Progress Tracker & ClassRank</h2>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Your Subject Progress</h3>
                {mockProgress.length === 0 ? (
                    <p className="text-gray-600 dark:text-gray-400">Please add subjects to your profile to track progress.</p>
                ) : (
                    <div className="space-y-4">
                        {mockProgress.map((item, index) => (
                            <div key={index} className="flex items-center">
                                <span className="w-32 text-gray-700 dark:text-gray-300 font-medium">{item.subject}:</span>
                                <div className="flex-grow bg-gray-200 dark:bg-gray-700 rounded-full h-4">
                                    <div
                                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                                        style={{ width: `${item.progress}%` }}
                                    ></div>
                                </div>
                                <span className="ml-4 text-gray-800 dark:text-gray-200 font-semibold">{item.progress}%</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Class Leaderboard</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                    The class leaderboard will display top performers based on quiz scores, contributions, and syllabus completion.
                </p>
                <ul className="list-disc list-inside text-gray-600 dark:text-gray-400">
                    <li>1. [Top Student Name] - 1500 Points</li>
                    <li>2. [Second Student Name] - 1450 Points</li>
                    <li>3. [Third Student Name] - 1400 Points</li>
                    <li>...</li>
                </ul>
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                    (Full leaderboard functionality and scoring system would be implemented here.)
                </p>
            </div>
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};


const ExamBattleModePage = () => (
    <div className="p-6 flex flex-col items-center justify-center h-full text-center">
        <Shield size={64} className="text-indigo-600 dark:text-indigo-400 mb-6" />
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Exam Battle Mode</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-8">
            Form study squads, complete daily learning missions, and track your team's score and motivation!
        </p>
        <button className="px-8 py-4 bg-indigo-600 text-white rounded-full text-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 shadow-lg">
            Start a Battle
        </button>
    </div>
);

const WhisperBoxPage = () => (
    <div className="p-6 flex flex-col items-center justify-center h-full text-center">
        <MessageSquare size={64} className="text-indigo-600 dark:text-indigo-400 mb-6" />
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">WhisperBox (Anonymous Confession Room)</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-8">
            Post your thoughts anonymously. Teachers and monitors can respond if needed, covering issues like stress and bullying.
        </p>
        <button className="px-8 py-4 bg-indigo-600 text-white rounded-full text-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 shadow-lg">
            Post Anonymously
        </button>
    </div>
);

const LinkVaultPage = () => (
    <div className="p-6 flex flex-col items-center justify-center h-full text-center">
        <Link size={64} className="text-indigo-600 dark:text-indigo-400 mb-6" />
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Link Vault</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-8">
            Save and organize all your class links (Zoom, Google Meet, documents) by subject. One-click join and alerts!
        </p>
        <button className="px-8 py-4 bg-indigo-600 text-white rounded-full text-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 shadow-lg">
            Manage Links
        </button>
    </div>
);

const FocusModePage = () => (
    <div className="p-6 flex flex-col items-center justify-center h-full text-center">
        <Timer size={64} className="text-indigo-600 dark:text-indigo-400 mb-6" />
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Focus Mode</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-8">
            Use a Pomodoro-style timer with optional face-detection to check attention. Generate your daily focus score!
        </p>
        <button className="px-8 py-4 bg-indigo-600 text-white rounded-full text-lg font-semibold hover:bg-indigo-700 transition-colors duration-200 shadow-lg">
            Start Focus Session
        </button>
    </div>
);

// Settings Page Component
const SettingsPage = ({ setSelectedChatUser, setActiveTab }) => {
    const { db, userId, profile, appId, activeClassGroup } = useAppContext();
    const [message, setMessage] = useState('');
    const [targetUserForAISchedule, setTargetUserForAISchedule] = useState('');
    const [aiScheduledMessageText, setAiScheduledMessageText] = useState('');
    const [scheduledMessages, setScheduledMessages] = useState([]);
    const [userPresence, setUserPresence] = useState({}); // To monitor online status for AI scheduling
    const [allUsers, setAllUsers] = useState([]); // To populate the dropdown with all available users

    useEffect(() => {
        if (!db || !userId) return;

        // Listen for scheduled messages
        const scheduledMessagesRef = collection(db, `artifacts/${appId}/users/${userId}/scheduledMessages`);
        const unsubscribeScheduled = onSnapshot(query(scheduledMessagesRef, orderBy('createdAt', 'desc')), (snapshot) => {
            setScheduledMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        // Listen for user presence updates for AI scheduling and to get all users
        const userPresenceRef = collection(db, `artifacts/${appId}/public/data/userPresence`);
        const unsubscribePresence = onSnapshot(userPresenceRef, (snapshot) => {
            const presenceData = {};
            const usersData = [];
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
                presenceData[doc.id] = data.isOnline && data.lastActive > thirtySecondsAgo;
                usersData.push({ uid: doc.id, displayName: data.displayName });
            });
            setUserPresence(presenceData);
            setAllUsers(usersData);
        });

        return () => {
            unsubscribeScheduled();
            unsubscribePresence();
        };
    }, [db, userId, appId]);

    // AI-Scheduled Message logic (client-side simulation)
    useEffect(() => {
        if (!db || !userId || !profile) return;

        scheduledMessages.forEach(async (scheduledMsg) => {
            if (scheduledMsg.status === 'pending' && userPresence[scheduledMsg.targetUserId]) {
                // Target user is online, send the message
                const chatId = [userId, scheduledMsg.targetUserId].sort().join('_');
                const chatMessagesRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);

                await addDoc(chatMessagesRef, {
                    senderId: userId,
                    senderDisplayName: profile.displayName,
                    receiverId: scheduledMsg.targetUserId,
                    messageType: 'text',
                    text: `AI-Scheduled: ${scheduledMsg.messageText}`,
                    timestamp: new Date().toISOString(),
                    isRead: false,
                });

                // Mark scheduled message as sent
                const scheduledMsgDocRef = doc(db, `artifacts/${appId}/users/${userId}/scheduledMessages`, scheduledMsg.id);
                await updateDoc(scheduledMsgDocRef, { status: 'sent', sentAt: new Date().toISOString() });
                setMessage(`AI sent message to ${scheduledMsg.targetUserDisplayName} when they came online.`);
            }
        });
    }, [scheduledMessages, userPresence, db, userId, appId, profile]);


    const handleScheduleAIMessage = async () => {
        if (!targetUserForAISchedule || !aiScheduledMessageText.trim()) {
            setMessage("Please select a target user and type a message.");
            return;
        }
        if (!db || !userId || !profile) {
            setMessage("Database not initialized, user not authenticated, or profile missing.");
            return;
        }

        // Find the target user's display name
        const targetMember = allUsers.find(m => m.uid === targetUserForAISchedule);
        if (!targetMember) {
            setMessage("Target user not found.");
            return;
        }

        try {
            const scheduledMessagesRef = collection(db, `artifacts/${appId}/users/${userId}/scheduledMessages`);
            await addDoc(scheduledMessagesRef, {
                targetUserId: targetUserForAISchedule,
                targetUserDisplayName: targetMember.displayName,
                messageText: aiScheduledMessageText.trim(),
                status: 'pending',
                createdAt: new Date().toISOString(),
                scheduledByDisplayName: profile.displayName,
            });
            setTargetUserForAISchedule('');
            setAiScheduledMessageText('');
            setMessage("Message scheduled successfully! AI will send it when the user comes online.");
        } catch (e) {
            console.error("Error scheduling AI message:", e);
            setMessage("Failed to schedule message.");
        }
    };

    return (
        <div className="p-6">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Settings</h2>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Account Settings</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                    Manage your email, password, and other account-related preferences here.
                </p>
                <button className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200">
                    Edit Account Info
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Notification Preferences</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                    Control how and when you receive notifications from ClassSync X.
                </p>
                <button className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200">
                    Manage Notifications
                </button>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Privacy Controls</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                    Adjust your privacy settings, including data sharing and profile visibility.
                </p>
                <button className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors duration-200">
                    Review Privacy Settings
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Note: Private DMs are stored securely in Firebase, but are not end-to-end encrypted in this client-side application.
                </p>
            </div>

            {/* Offline Support Note */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Offline Support</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                    ClassSync X leverages Firebase's offline capabilities. Your notes, calendar events, and chat messages will be accessible even without an internet connection. Changes made offline will automatically sync once you're back online.
                </p>
            </div>

            {/* AI-Scheduled Message Section */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md mb-8">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">🤖 AI-Scheduled Message</h3>
                <p className="text-gray-700 dark:text-gray-300 mb-4">
                    Schedule a message to be sent automatically when a specific classmate comes online.
                </p>
                <div className="mb-4">
                    <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                        Target User:
                    </label>
                    <select
                        value={targetUserForAISchedule}
                        onChange={(e) => setTargetUserForAISchedule(e.target.value)}
                        className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                    >
                        <option value="">Select a Classmate</option>
                        {allUsers
                            ?.filter(member => member.uid !== userId && member.displayName) // Exclude self and users without display name
                            .map(member => (
                                <option key={member.uid} value={member.uid}>
                                    {member.displayName} {userPresence[member.uid] ? '✅ Online' : '⚪ Offline'}
                                </option>
                            ))}
                    </select>
                </div>
                <div className="mb-4">
                    <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">
                        Message:
                    </label>
                    <textarea
                        placeholder="Your message for the AI to send..."
                        value={aiScheduledMessageText}
                        onChange={(e) => setAiScheduledMessageText(e.target.value)}
                        rows="3"
                        className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500 mb-4"
                    ></textarea>
                </div>
                <button
                    onClick={handleScheduleAIMessage}
                    className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors duration-200 flex items-center"
                    disabled={!targetUserForAISchedule || !aiScheduledMessageText.trim()}
                >
                    Schedule Message
                </button>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    (Note: This feature is simulated client-side. It requires your app to be open to monitor online status and send the message.)
                </p>

                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">Scheduled Messages:</h4>
                {scheduledMessages.length === 0 ? (
                    <p className="text-gray-600 dark:text-gray-400">No messages scheduled yet.</p>
                ) : (
                    <ul className="space-y-2">
                        {scheduledMessages.map(msg => (
                            <li key={msg.id} className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md">
                                <p className="text-sm text-gray-800 dark:text-gray-200">
                                    To: <span className="font-semibold">{msg.targetUserDisplayName}</span>
                                </p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 break-words">
                                    Message: "{msg.messageText}"
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Status: <span className={`font-semibold ${msg.status === 'sent' ? 'text-green-600' : 'text-yellow-600'}`}>{msg.status}</span>
                                    {msg.sentAt && ` at ${new Date(msg.sentAt).toLocaleTimeString()}`}
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};

// Chat Page Component
const ChatPage = ({ selectedChatUser, setSelectedChatUser, setActiveTab }) => {
    const { db, userId, profile, appId } = useAppContext();
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [message, setMessage] = useState('');
    const [typingStatus, setTypingStatus] = useState({});
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const messagesEndRef = useRef(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchUsers, setSearchUsers] = useState([]); // Users found by search
    const [userPresence, setUserPresence] = useState({}); // To store online status for all users

    const getChatId = (user1Id, user2Id) => {
        return [user1Id, user2Id].sort().join('_');
    };

    const chatId = selectedChatUser ? getChatId(userId, selectedChatUser.uid) : null;

    // Listen for all user presences for search and online status
    useEffect(() => {
        if (!db) return;
        const userPresenceRef = collection(db, `artifacts/${appId}/public/data/userPresence`);
        const unsubscribePresence = onSnapshot(userPresenceRef, (snapshot) => {
            const presenceData = {};
            const usersData = [];
            snapshot.docs.forEach(doc => {
                const data = doc.data();
                const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
                presenceData[doc.id] = data.isOnline && data.lastActive > thirtySecondsAgo;
                if (doc.id !== userId && data.displayName) { // Exclude self and users without display name
                    usersData.push({ uid: doc.id, displayName: data.displayName });
                }
            });
            setUserPresence(presenceData);
            setSearchUsers(usersData); // Initialize search users with all available users
        }, (error) => {
            console.error("Error fetching user presence for chat search:", error);
        });
        return () => unsubscribePresence();
    }, [db, appId, userId]);


    // Listen for messages
    useEffect(() => {
        if (!db || !chatId) return;

        const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
        const q = query(messagesCollectionRef, orderBy('timestamp'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
        }, (error) => {
            console.error("Error fetching messages:", error);
            setMessage("Failed to load messages.");
        });

        return () => unsubscribe();
    }, [db, chatId, appId]);

    // Listen for typing status
    useEffect(() => {
        if (!db || !chatId || !selectedChatUser) return;

        const typingStatusRef = collection(db, `artifacts/${appId}/public/data/typingStatus`);
        // Listen for typing status of the other user
        const q = query(typingStatusRef, where('chatId', '==', chatId), where('userId', '==', selectedChatUser.uid), limit(1));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                setTypingStatus(prev => ({ ...prev, [selectedChatUser.uid]: data.isTyping }));
            } else {
                setTypingStatus(prev => ({ ...prev, [selectedChatUser.uid]: false }));
            }
        }, (error) => {
            console.error("Error fetching typing status:", error);
        });

        return () => unsubscribe();
    }, [db, chatId, appId, selectedChatUser]);

    // Update own typing status
    useEffect(() => {
        if (!db || !chatId || !userId) return;

        const typingStatusDocRef = doc(db, `artifacts/${appId}/public/data/typingStatus`, `${chatId}_${userId}`);

        const updateOwnTypingStatus = async (isTyping) => {
            await setDoc(typingStatusDocRef, {
                chatId: chatId,
                userId: userId,
                isTyping: isTyping,
                timestamp: new Date().toISOString()
            }, { merge: true });
        };

        const timer = setTimeout(() => {
            updateOwnTypingStatus(false);
        }, 3000); // Stop typing after 3 seconds of no input

        if (newMessage.length > 0) {
            updateOwnTypingStatus(true);
            clearTimeout(timer); // Reset timer if still typing
        }

        return () => clearTimeout(timer);
    }, [newMessage, db, chatId, userId, appId]);


    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async () => {
        if (!newMessage.trim() && !selectedFile) {
            setMessage("Message cannot be empty.");
            return;
        }
        if (!db || !userId || !profile || !selectedChatUser) {
            setMessage("Chat not initialized correctly.");
            return;
        }

        try {
            const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
            const messageData = {
                senderId: userId,
                senderDisplayName: profile.displayName,
                receiverId: selectedChatUser.uid,
                receiverDisplayName: selectedChatUser.displayName,
                timestamp: new Date().toISOString(),
                isRead: false,
            };

            if (selectedFile) {
                // Simulate file upload
                messageData.messageType = selectedFile.type.startsWith('image/') ? 'image' : selectedFile.type.includes('pdf') ? 'pdf' : selectedFile.type.startsWith('audio/') ? 'audio' : 'file';
                messageData.fileURL = `simulated-url-for-${selectedFile.name}`;
                messageData.text = `[File: ${selectedFile.name}]`; // Text representation for file
            } else {
                messageData.messageType = 'text';
                messageData.text = newMessage.trim();
            }

            await addDoc(messagesCollectionRef, messageData);
            setNewMessage('');
            setSelectedFile(null); // Clear selected file
            setShowEmojiPicker(false); // Hide emoji picker after sending
        } catch (e) {
            console.error("Error sending message: ", e);
            setMessage("Failed to send message.");
        }
    };

    const handleEmojiClick = (emojiObject) => {
        setNewMessage(prevMsg => prevMsg + emojiObject.emoji);
    };

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
        } else {
            setSelectedFile(null);
        }
    };

    const handleSearchChange = (e) => {
        setSearchTerm(e.target.value);
    };

    const filteredSearchUsers = searchUsers.filter(user =>
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!selectedChatUser) {
        return (
            <div className="p-6 flex flex-col items-center justify-start h-full text-center">
                <MessageSquare size={64} className="text-gray-400 mb-6" />
                <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-300 mb-4">Start a New Chat</h2>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Search for classmates by name to start a private conversation.
                </p>

                <div className="w-full max-w-md mb-6">
                    <input
                        type="text"
                        placeholder="Search for a classmate..."
                        value={searchTerm}
                        onChange={handleSearchChange}
                        className="w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                    />
                </div>

                <div className="w-full max-w-md overflow-y-auto max-h-96 bg-white dark:bg-gray-800 rounded-lg shadow-md p-4">
                    {filteredSearchUsers.length === 0 && searchTerm !== '' ? (
                        <p className="text-gray-600 dark:text-gray-400">No users found.</p>
                    ) : filteredSearchUsers.length === 0 && searchTerm === '' ? (
                        <p className="text-gray-600 dark:text-gray-400">Start typing to find classmates.</p>
                    ) : (
                        <ul className="space-y-2">
                            {filteredSearchUsers.map(user => (
                                <li key={user.uid} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200">
                                    <div className="flex items-center">
                                        <span className={`mr-2 ${userPresence[user.uid] ? 'text-green-500' : 'text-gray-400'}`}>
                                            {userPresence[user.uid] ? '✅' : '⚪'}
                                        </span>
                                        <span className="text-gray-800 dark:text-gray-200 font-medium">{user.displayName}</span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedChatUser(user)}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors duration-200 text-sm"
                                    >
                                        Chat
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
            {/* Chat Header */}
            <div className="bg-white dark:bg-gray-800 shadow-sm p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                <button onClick={() => setSelectedChatUser(null)} className="text-gray-600 dark:text-gray-400 hover:text-indigo-600">
                    <XCircle size={24} />
                </button>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Chat with {selectedChatUser.displayName}
                </h3>
                <div className={`w-3 h-3 rounded-full ${typingStatus[selectedChatUser.uid] ? 'bg-green-500 animate-pulse' : 'bg-transparent'}`}></div>
            </div>

            {/* Messages Area */}
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}
                    >
                        <div className={`max-w-[70%] p-3 rounded-lg shadow-md ${
                            msg.senderId === userId
                                ? 'bg-indigo-600 text-white rounded-br-none'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-none'
                        }`}>
                            <p className="text-xs font-semibold mb-1">
                                {msg.senderId === userId ? 'You' : msg.senderDisplayName}
                            </p>
                            {msg.messageType === 'text' && (
                                <p className="text-sm break-words">{msg.text}</p>
                            )}
                            {msg.messageType === 'image' && (
                                <>
                                    <img src={msg.fileURL || "https://placehold.co/150x100?text=Image"} alt="Sent Image" className="max-w-full h-auto rounded-md mb-1" />
                                    <p className="text-xs text-gray-50 dark:text-gray-400">{msg.text}</p>
                                </>
                            )}
                            {msg.messageType === 'pdf' && (
                                <div className="flex items-center">
                                    <FileText size={20} className="mr-2" />
                                    <a href={msg.fileURL || "#"} target="_blank" rel="noopener noreferrer" className="text-blue-200 dark:text-blue-400 underline text-sm">
                                        {msg.text}
                                    </a>
                                </div>
                            )}
                            {msg.messageType === 'audio' && (
                                <div className="flex items-center">
                                    <Mic size={20} className="mr-2" />
                                    <a href={msg.fileURL || "#"} target="_blank" rel="noopener noreferrer" className="text-blue-200 dark:text-blue-400 underline text-sm">
                                        {msg.text}
                                    </a>
                                </div>
                            )}
                            <p className="text-xs text-right mt-1 opacity-75">
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                    </div>
                ))}
                {typingStatus[selectedChatUser.uid] && (
                    <div className="flex justify-start">
                        <div className="bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 p-2 rounded-lg rounded-bl-none text-sm animate-pulse">
                            {selectedChatUser.displayName} is typing...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="bg-white dark:bg-gray-800 p-4 border-t border-gray-200 dark:border-gray-700 flex items-center space-x-2">
                <input
                    type="file"
                    id="file-input"
                    className="hidden"
                    onChange={handleFileChange}
                    accept="image/*,.pdf,audio/*"
                />
                <label htmlFor="file-input" className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full cursor-pointer">
                    <Paperclip size={24} />
                </label>
                {selectedFile && (
                    <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded-md px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
                        {selectedFile.name}
                        <button onClick={() => setSelectedFile(null)} className="ml-2 text-red-500">
                            <XCircle size={16} />
                        </button>
                    </div>
                )}
                <input
                    type="text"
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
                    className="flex-grow p-3 rounded-md border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
                >
                    <Smile size={24} />
                </button>
                <button
                    onClick={handleSendMessage}
                    className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                >
                    <Send size={24} />
                </button>
            </div>

            {showEmojiPicker && (
                <div className="absolute bottom-20 right-4 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-3 grid grid-cols-8 gap-2 max-w-xs max-h-60 overflow-y-auto">
                    {['😀', '😂', '😊', '😍', '👍', '🙏', '🔥', '🎉', '📚', '✏️', '💡', '💯', '🚀', '🌟', '🤔', '🥳'].map(emoji => (
                        <button key={emoji} onClick={() => handleEmojiClick({ emoji: emoji })} className="text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md p-1">
                            {emoji}
                        </button>
                    ))}
                </div>
            )}
            <MessageModal message={message} onClose={() => setMessage('')} />
        </div>
    );
};


// Main App Content Component
const MainAppContent = () => {
    const [activeTab, setActiveTab] = useState('home');
    const [darkMode, setDarkMode] = useState(false);
    const { isAuthReady, needsProfileSetup, updateProfile, needsClassGroupSetup, setNeedsClassGroupSetup } = useAppContext();
    const [selectedChatUser, setSelectedChatUser] = useState(null); // State for selected DM user
    const [selectedGroupChat, setSelectedGroupChat] = useState(null); // State for selected Group Chat

    // Toggle dark mode
    const toggleDarkMode = () => {
        setDarkMode(!darkMode);
        document.documentElement.classList.toggle('dark', !darkMode);
    };

    // Render the active tab content
    const renderContent = () => {
        if (!isAuthReady) {
            return (
                <div className="flex justify-center items-center h-full">
                    <p className="text-gray-600 dark:text-gray-400">Loading application...</p>
                </div>
            );
        }
        if (needsProfileSetup) {
            return <ProfileSetupModal isOpen={needsProfileSetup} onClose={() => {}} onSave={updateProfile} />;
        }
        if (needsClassGroupSetup) {
            return <FirstTimeClassGroupSetupModal isOpen={needsClassGroupSetup} onClose={() => setNeedsClassGroupSetup(false)} />;
        }

        switch (activeTab) {
            case 'home':
                return <HomePage setActiveTab={setActiveTab} />; // Pass setActiveTab to HomePage
            case 'calendar':
                return <CalendarPage />;
            case 'notes':
                return <NotesPage />;
            case 'class-groups':
                return <ClassGroupsPage setActiveTab={setActiveTab} setSelectedChatUser={setSelectedChatUser} setSelectedGroupChat={setSelectedGroupChat} />;
            case 'ai':
                return <AIDoubtSolverPage />;
            case 'profile':
                return <ProfilePage setActiveTab={setActiveTab} />; // Pass setActiveTab to ProfilePage
            case 'flashcards':
                return <FlashcardsPage />;
            case 'progress-tracker':
                return <ProgressTrackerPage />;
            case 'exam-battle':
                return <ExamBattleModePage />;
            case 'whisperbox':
                return <WhisperBoxPage />;
            case 'link-vault':
                return <LinkVaultPage />;
            case 'focus-mode':
                return <FocusModePage />;
            case 'settings': // New case for settings page
                return <SettingsPage setSelectedChatUser={setSelectedChatUser} setActiveTab={setActiveTab} />;
            case 'chat': // New case for chat page (DMs)
                return <ChatPage selectedChatUser={selectedChatUser} setSelectedChatUser={setSelectedChatUser} setActiveTab={setActiveTab} />;
            case 'group-chat': // New case for group chat
                return <GroupChatPage activeClassGroup={selectedGroupChat} setSelectedGroupChat={setSelectedGroupChat} setActiveTab={setActiveTab} />;
            default:
                return <HomePage setActiveTab={setActiveTab} />;
        }
    };

    return (
        <div className={`min-h-screen flex flex-col font-inter ${darkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'}`}>
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 shadow-sm p-4 flex items-center justify-between sticky top-0 z-10">
                <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">ClassSync X</h1>
                <button
                    onClick={toggleDarkMode}
                    className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                    title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                >
                    {darkMode ? <Sun size={24} /> : <Moon size={24} />}
                </button>
            </header>

            {/* Main Content Area */}
            <main className="flex-grow overflow-auto pb-20">
                {renderContent()}
            </main>

            {/* Bottom Navigation */}
            {isAuthReady && !needsProfileSetup && !needsClassGroupSetup && (
                <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 shadow-lg border-t border-gray-200 dark:border-gray-700 z-20">
                    <div className="flex justify-around items-center h-16 max-w-lg mx-auto">
                        <NavItem icon={<Home size={24} />} label="Home" isActive={activeTab === 'home'} onClick={() => setActiveTab('home')} />
                        <NavItem icon={<CalendarDays size={24} />} label="Calendar" isActive={activeTab === 'calendar'} onClick={() => setActiveTab('calendar')} />
                        <NavItem icon={<BookText size={24} />} label="Notes" isActive={activeTab === 'notes'} onClick={() => setActiveTab('notes')} />
                        <NavItem icon={<Users size={24} />} label="Groups" isActive={activeTab === 'class-groups'} onClick={() => setActiveTab('class-groups')} />
                        <NavItem icon={<MessageSquare size={24} />} label="Chat" isActive={activeTab === 'chat'} onClick={() => setActiveTab('chat')} />
                        <NavItem icon={<User size={24} />} label="Profile" isActive={activeTab === 'profile'} onClick={() => setActiveTab('profile')} />
                    </div>
                </nav>
            )}
        </div>
    );
};


// Root App Component
const App = () => {
    return (
        <AppProvider>
            <MainAppContent />
        </AppProvider>
    );
};

// Navigation Item Component
const NavItem = ({ icon, label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center p-2 rounded-md transition-colors duration-200
            ${isActive
                ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-gray-700'
                : 'text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
    >
        {icon}
        <span className="text-xs mt-1 font-medium">{label}</span>
    </button>
);

export default App;