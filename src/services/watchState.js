import { reactive } from 'vue';
const watchState = reactive({
    isLoggedIn: false,
    isFriendsLoaded: false,
    isFavoritesLoaded: false,
    // set by the host when the window is minimized or hidden to the tray; plain modules read
    // this instead of importing a store, which keeps the dependency graph acyclic
    isEnergySaving: false
});

export { watchState };
