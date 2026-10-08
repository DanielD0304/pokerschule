// Brücke vom imperativen Spielcode zum React-Router.
let navigate = path => { window.location.assign(path); };
export const setNavigator = fn => { navigate = fn; };
export const go = path => navigate(path);
