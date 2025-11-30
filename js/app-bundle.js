/**
 * Rio Flood Monitor - Bundled Application
 * All code in one file for file:// compatibility
 */

(function() {
    'use strict';
    
    // ===========================================
    // CONFIGURATION
    // ===========================================
    
    const CONFIG = {
        apiBaseUrl: 'https://octa-api-871238133710.us-central1.run.app',
        authApiUrl: 'https://mongo-api-871238133710.us-central1.run.app',
        aiCameraClientUrl: 'https://ai-camera-client-871238133710.us-central1.run.app',
        cameraUrl: 'https://dev.tixxi.rio/outvideo3/?KEY=O2417&CODE=',
        timeout: 30000,
        retryAttempts: 3,
        storagePrefix: 'floodMonitor_'
    };
    
    // ===========================================
    // UTILITIES
    // ===========================================
    
    // LocalStorage utilities
    const Storage = {
        set: function(key, value) {
            try {
                localStorage.setItem(CONFIG.storagePrefix + key, JSON.stringify(value));
            } catch (e) {
                console.error('Storage error:', e);
            }
        },
        get: function(key, defaultValue) {
            try {
                const item = localStorage.getItem(CONFIG.storagePrefix + key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (e) {
                return defaultValue;
            }
        },
        remove: function(key) {
            localStorage.removeItem(CONFIG.storagePrefix + key);
        },
        getAuthToken: function() {
            return localStorage.getItem('authToken');
        },
        setAuthToken: function(token) {
            localStorage.setItem('authToken', token);
        },
        removeAuthToken: function() {
            localStorage.removeItem('authToken');
        },
        getPreferences: function() {
            return this.get('preferences', {
                theme: 'light',
                autoRefresh: true,
                refreshInterval: 60
            });
        },
        setPreferences: function(prefs) {
            this.set('preferences', prefs);
        }
    };
    
    // Date/Time utilities
    const DateTime = {
        formatDate: function(dateString) {
            if (!dateString) return '--';
            try {
                const date = new Date(dateString);
                return new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                }).format(date);
            } catch (e) {
                return dateString;
            }
        },
        getRelativeTime: function(dateString) {
            if (!dateString) return '--';
            try {
                const date = new Date(dateString);
                const now = new Date();
                const diffMs = now - date;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                
                if (diffMins < 1) return 'Agora';
                if (diffMins < 60) return diffMins + ' min atrás';
                if (diffHours < 24) return diffHours + 'h atrás';
                if (diffDays < 7) return diffDays + 'd atrás';
                
                return this.formatDate(dateString);
            } catch (e) {
                return dateString;
            }
        }
    };
    
    // Color utilities
    const Colors = {
        STATUS_COLORS: {
            0: {
                bg: 'bg-green-100 dark:bg-green-900/30',
                text: 'text-green-800 dark:text-green-300',
                border: 'border-green-300 dark:border-green-700',
                hex: '#10b981',
                name: 'Normal'
            },
            1: {
                bg: 'bg-yellow-100 dark:bg-yellow-900/30',
                text: 'text-yellow-800 dark:text-yellow-300',
                border: 'border-yellow-300 dark:border-yellow-700',
                hex: '#f59e0b',
                name: 'Atenção'
            },
            2: {
                bg: 'bg-orange-100 dark:bg-orange-900/30',
                text: 'text-orange-800 dark:text-orange-300',
                border: 'border-orange-300 dark:border-orange-700',
                hex: '#ef4444',
                name: 'Alerta'
            },
            3: {
                bg: 'bg-red-100 dark:bg-red-900/30',
                text: 'text-red-800 dark:text-red-300',
                border: 'border-red-300 dark:border-red-700',
                hex: '#dc2626',
                name: 'Crítico'
            }
        },
        getStatusColors: function(statusCode) {
            return this.STATUS_COLORS[statusCode] || this.STATUS_COLORS[0];
        },
        getStatusHex: function(statusCode) {
            return this.STATUS_COLORS[statusCode]?.hex || '#10b981';
        }
    };
    
    // ===========================================
    // NOTIFICATIONS
    // ===========================================
    
    const Notifications = {
        EXPIRY_DURATION: 60 * 60 * 1000, // 1 hour in milliseconds
        
        getNotificationKey: function(polygon) {
            // Create unique key based on cluster_id, status_code, and alert sources
            const hasWaze = (polygon.waze_flood_count || 0) > 0;
            const hasAI = (polygon.camera_flood_count || 0) > 0;
            return `${polygon.cluster_id}_status_${polygon.status_code}_w${hasWaze}_a${hasAI}`;
        },
        
        getReadNotifications: function() {
            const stored = Storage.get('readNotifications', {});
            // Clean up expired entries
            const now = Date.now();
            const cleaned = {};
            Object.keys(stored).forEach(function(key) {
                if (stored[key].expiryTime > now) {
                    cleaned[key] = stored[key];
                }
            });
            
            // Save cleaned version if anything was removed
            if (Object.keys(cleaned).length !== Object.keys(stored).length) {
                Storage.set('readNotifications', cleaned);
            }
            
            return cleaned;
        },
        
        isNotificationRead: function(polygon) {
            const key = this.getNotificationKey(polygon);
            const readNotifications = this.getReadNotifications();
            const readNotif = readNotifications[key];
            
            // Check if notification exists and hasn't expired
            return readNotif && Date.now() < readNotif.expiryTime;
        },
        
        markAsRead: function(polygon) {
            const key = this.getNotificationKey(polygon);
            const readNotifications = this.getReadNotifications();
            
            readNotifications[key] = {
                timestamp: Date.now(),
                expiryTime: Date.now() + this.EXPIRY_DURATION,
                clusterId: polygon.cluster_id,
                statusCode: polygon.status_code,
                sources: {
                    waze: (polygon.waze_flood_count || 0) > 0,
                    ai: (polygon.camera_flood_count || 0) > 0
                }
            };
            
            Storage.set('readNotifications', readNotifications);
        },
        
        markAllAsRead: function(polygons) {
            const readNotifications = this.getReadNotifications();
            const now = Date.now();
            
            polygons.forEach(function(polygon) {
                if (polygon.status_code > 0) {
                    const key = Notifications.getNotificationKey(polygon);
                    readNotifications[key] = {
                        timestamp: now,
                        expiryTime: now + Notifications.EXPIRY_DURATION,
                        clusterId: polygon.cluster_id,
                        statusCode: polygon.status_code,
                        sources: {
                            waze: (polygon.waze_flood_count || 0) > 0,
                            ai: (polygon.camera_flood_count || 0) > 0
                        }
                    };
                }
            });
            
            Storage.set('readNotifications', readNotifications);
        },
        
        getUnreadNotifications: function(polygons) {
            const self = this;
            return polygons.filter(function(polygon) {
                return polygon.status_code > 0 && !self.isNotificationRead(polygon);
            });
        },
        
        getUnreadCount: function(polygons) {
            return this.getUnreadNotifications(polygons).length;
        },
        
        cleanupExpired: function() {
            // This is called automatically in getReadNotifications
            this.getReadNotifications();
        }
    };
    
    // ===========================================
    // STATE MANAGEMENT
    // ===========================================
    
    const State = {
        _state: {},
        _listeners: {},
        
        setState: function(keyPath, value) {
            const keys = keyPath.split('.');
            let currentLevel = this._state;
            
            // Navigate to the parent of the final key
            for (let i = 0; i < keys.length - 1; i++) {
                const key = keys[i];
                if (!currentLevel[key] || typeof currentLevel[key] !== 'object') {
                    currentLevel[key] = {};
                }
                currentLevel = currentLevel[key];
            }
            
            const finalKey = keys[keys.length - 1];
            const oldValue = currentLevel[finalKey];
            
            // Only update if value changed
            if (oldValue !== value) {
                currentLevel[finalKey] = value;
                console.log('State updated:', keyPath, '=', value);
                
                // Notify listeners
                if (this._listeners[keyPath]) {
                    this._listeners[keyPath].forEach(function(callback) {
                        try {
                            callback(value);
                        } catch (error) {
                            console.error('Error in state listener:', error);
                        }
                    });
                }
            }
        },
        
        getState: function(keyPath) {
            try {
                return keyPath.split('.').reduce(function(acc, key) {
                    return acc && acc[key];
                }, this._state);
            } catch (error) {
                console.error('Error getting state:', keyPath, error);
                return undefined;
            }
        },
        
        subscribe: function(keyPath, callback) {
            if (!this._listeners[keyPath]) {
                this._listeners[keyPath] = [];
            }
            if (!this._listeners[keyPath].includes(callback)) {
                this._listeners[keyPath].push(callback);
            }
        },
        
        unsubscribe: function(keyPath, callback) {
            if (this._listeners[keyPath]) {
                this._listeners[keyPath] = this._listeners[keyPath].filter(function(cb) {
                    return cb !== callback;
                });
            }
        }
    };
    
    // ===========================================
    // COMPONENTS
    // ===========================================
    
    const Components = {
        createButton: function(text, classes = [], id = '', type = 'button', disabled = false) {
            const baseClasses = 'inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition duration-150 ease-in-out';
            const themeClasses = 'text-white bg-brand-500 hover:bg-brand-600 focus:ring-brand-500';
            const disabledClasses = disabled ? 'opacity-50 cursor-not-allowed' : '';
            const customClasses = classes.join(' ');
            const buttonId = id ? 'id="' + id + '"' : '';
            const disabledAttr = disabled ? 'disabled' : '';
            
            return '<button type="' + type + '" ' + buttonId + ' class="' + baseClasses + ' ' + themeClasses + ' ' + customClasses + ' ' + disabledClasses + '" ' + disabledAttr + '>' +
                text +
                '</button>';
        },
        
        setButtonLoading: function(button, isLoading, loadingText, originalText) {
            if (!button) return;
            
            if (isLoading) {
                // Save original text if not already saved
                if (!button.hasAttribute('data-original-text')) {
                    button.setAttribute('data-original-text', originalText || button.innerText);
                }
                button.disabled = true;
                button.classList.add('opacity-75', 'cursor-not-allowed');
                // Insert spinner and loading text
                button.innerHTML = '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">' +
                    '<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>' +
                    '<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>' +
                    '</svg>' +
                    (loadingText || 'Processing...');
            } else {
                button.disabled = false;
                button.classList.remove('opacity-75', 'cursor-not-allowed');
                // Restore original text
                const text = originalText || button.getAttribute('data-original-text') || 'Submit';
                button.innerText = text;
            }
        },
        
        createSpinner: function(size = 'h-12 w-12', color = 'border-brand-500') {
            return '<div class="flex justify-center items-center">' +
                '<div class="animate-spin rounded-full ' + size + ' border-t-4 border-b-4 ' + color + ' border-gray-200 dark:border-gray-600"></div>' +
                '</div>';
        }
    };
    
    // Expose Components and State to window for use in login/signup pages
    window.Components = Components;
    window.State = State;
    
    // ===========================================
    // API CLIENT
    // ===========================================
    
    const API = {
        makeRequest: async function(endpoint, options = {}) {
            const url = CONFIG.apiBaseUrl + endpoint;
            const token = Storage.getAuthToken();
            
            const defaultOptions = {
                headers: {
                    'Content-Type': 'application/json',
                    ...(token && { 'Authorization': 'Bearer ' + token })
                },
                ...options
            };
            
            try {
                const response = await fetch(url, defaultOptions);
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return await response.json();
            } catch (error) {
                console.error('API request failed:', error);
                throw error;
            }
        },
        
        getPolygons: async function() {
            return await this.makeRequest('/mongo/Polygons/latest');
        },
        
        getCameras: async function() {
            return await this.makeRequest('/cameras');
        },
        
        getCameraImageUrl: function(cameraCode, addTimestamp = true) {
            let url = CONFIG.cameraUrl + cameraCode;
            if (addTimestamp) {
                url += '&dt=' + Date.now();
            }
            return url;
        },
        
        searchPolygons: async function(query) {
            const polygons = await this.getPolygons();
            const lowerQuery = query.toLowerCase();
            return polygons.filter(function(polygon) {
                return (
                    (polygon.main_route && polygon.main_route.toLowerCase().includes(lowerQuery)) ||
                    (polygon.main_neighborhood && polygon.main_neighborhood.toLowerCase().includes(lowerQuery)) ||
                    (polygon.main_street_number_range && polygon.main_street_number_range.toLowerCase().includes(lowerQuery))
                );
            });
        },
        
        getCamerasForPolygon: async function(polygonId) {
            const cameras = await this.getCameras();
            return cameras.filter(function(cam) {
                return cam.cluster_id === polygonId;
            });
        },
        
        getStatistics: async function() {
            const polygons = await this.getPolygons();
            const stats = {
                totalRegions: polygons.length,
                activeAlerts: 0,
                unreadNotifications: 0,
                aiDetections: 0,
                wazeReports: 0
            };
            
            polygons.forEach(function(polygon) {
                if (polygon.status_code > 0) {
                    stats.activeAlerts++;
                }
                if (polygon.camera_flood_count) {
                    stats.aiDetections += polygon.camera_flood_count;
                }
                if (polygon.waze_flood_count) {
                    stats.wazeReports += polygon.waze_flood_count;
                }
            });
            
            // Get unread notification count
            stats.unreadNotifications = Notifications.getUnreadCount(polygons);
            
            return stats;
        },
        
        getCriticalAlerts: async function(limit = 10) {
            const polygons = await this.getPolygons();
            return polygons
                .filter(function(p) { return p.status_code >= 1; })
                .sort(function(a, b) { return b.status_code - a.status_code; })
                .slice(0, limit);
        }
    };
    
    // ===========================================
    // AUTHENTICATION
    // ===========================================
    
    const Auth = {
        isAuthenticated: function() {
            // Use this for url token based authentication
            // Obs: Must be used together with redirect /index.html?token=... in login function
            const urlToken = new URLSearchParams(window.location.search).get('token');
            if (urlToken) {
                Storage.setAuthToken(urlToken);
            }
            // Remove token from current url
            window.history.replaceState({}, document.title, window.location.pathname);
            // ---

            const token = Storage.getAuthToken();
            return !!token;
        },
        
        login: async function(email, password) {
            console.log('Attempting login for', email);
            State.setState('error', null);
            
            try {
                const response = await fetch(CONFIG.authApiUrl + '/signin', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email: email, password: password })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    const errorMsg = data.message || 'Login falhou. Status: ' + response.status;
                    console.error('Login failed:', errorMsg);
                    State.setState('error', errorMsg);
                    return false;
                }
                
                if (data.token) {
                    Storage.setAuthToken(data.token);
                    console.log('Login successful, token stored.');
                    
                    // Fetch user details
                    const user = await this.getCurrentUser();
                    
                    if (user) {
                        State.setState('currentUser', user);
                        State.setState('error', null);
                        // Redirect to main app
                        // window.location.href = 'index.html';

                        // Redirect to main app with url token
                        // Note: Must be used together with logic in Auth.isAuthenticated()
                        window.location.href = 'index.html?token=' + data.token;

                        return true;
                    } else {
                        console.error('Login succeeded but failed to fetch user details');
                        State.setState('error', 'Login bem-sucedido mas falha ao buscar detalhes do usuário');
                        this.logout();
                        return false;
                    }
                } else {
                    console.error('Login failed: No token received');
                    State.setState('error', 'Login falhou: Resposta inválida do servidor');
                    return false;
                }
            } catch (error) {
                console.error('Login error:', error);
                State.setState('error', 'Erro de login: ' + error.message);
                return false;
            }
        },
        
        register: async function(name, email, password) {
            console.log('Attempting registration for', email);
            State.setState('error', null);
            
            try {
                const response = await fetch(CONFIG.aiCameraClientUrl + '/user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name: name, email: email, password: password })
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    const errorMsg = data.message || 'Registro falhou. Status: ' + response.status;
                    console.error('Registration failed:', errorMsg);
                    State.setState('error', errorMsg);
                    return false;
                }
                
                console.log('Registration successful, attempting auto-login...');
                // Auto-login after successful registration
                return await this.login(email, password);
            } catch (error) {
                console.error('Registration error:', error);
                State.setState('error', 'Erro de registro: ' + error.message);
                return false;
            }
        },
        
        getCurrentUser: async function() {
            const token = Storage.getAuthToken();
            if (!token) return null;
            
            try {
                const response = await fetch(CONFIG.authApiUrl + '/user', {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + token,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.status === 200) {
                    return await response.json();
                } else if (response.status === 401) {
                    this.logout();
                    return null;
                }
            } catch (error) {
                console.error('Auth error:', error);
                return null;
            }
        },
        
        logout: function() {
            Storage.removeAuthToken();
            State.setState('currentUser', null);
            State.setState('error', null);
            window.location.href = 'login.html';
        },
        
        showLoginView: function() {
            // Helper for login page - no-op in bundle but used by pages
        },
        
        showMainAppView: function() {
            // Helper for main app - no-op in bundle but used by pages
        },
        
        initAuth: async function() {
            if (!this.isAuthenticated()) {
                this.logout();
                return null;
            }
            return await this.getCurrentUser();
        },
        
        getUserInitials: function(user) {
            if (!user) return 'U';
            if (user.name) {
                const names = user.name.split(' ');
                if (names.length >= 2) {
                    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
                }
                return names[0][0].toUpperCase();
            }
            if (user.email) return user.email[0].toUpperCase();
            return 'U';
        }
    };
    
    // Expose Auth to window for use in login/signup pages
    window.Auth = Auth;
    
    // ===========================================
    // MAP
    // ===========================================
    
    const Map = {
        map: null,
        markers: {},
        hoveredPolygonId: null,
        popup: null,
        pulseAnimationId: null,
        layerVisibility: {
            polygons: true,
            cameras: true,
            waze: false,
            weather: false
        },
        is3DMode: false,
        cameras: [],
        wazeAlerts: [],
        weatherStations: [],
        
        initMap: function(containerId) {
            return new Promise(function(resolve, reject) {
                try {
                    // Check if container exists
                    const container = document.getElementById(containerId);
                    if (!container) {
                        reject(new Error('Map container element not found: ' + containerId));
                        return;
                    }
                    
                    // Check if MapLibre is loaded
                    if (typeof maplibregl === 'undefined') {
                        reject(new Error('MapLibre GL JS not loaded'));
                        return;
                    }
                    
                    // Initialize MapLibre map
                    Map.map = new maplibregl.Map({
                        container: containerId,
                        style: {
                            version: 8,
                            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
                            sources: {
                                'osm': {
                                    type: 'raster',
                                    tiles: [
                                        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                                    ],
                                    tileSize: 256,
                                    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                }
                            },
                            layers: [
                                {
                                    id: 'osm-tiles',
                                    type: 'raster',
                                    source: 'osm',
                                    minzoom: 0,
                                    maxzoom: 19
                                }
                            ]
                        },
                        center: [-43.4350, -22.9200], // Rio de Janeiro
                        zoom: 10,
                        pitch: 0,
                        bearing: 0,
                        antialias: true,
                        fadeDuration: 300
                    });
                    
                    // Add navigation controls
                    const nav = new maplibregl.NavigationControl({
                        showCompass: true,
                        showZoom: true,
                        visualizePitch: true
                    });
                    Map.map.addControl(nav, 'top-right');
                    
                    // Add scale control
                    const scale = new maplibregl.ScaleControl({
                        maxWidth: 100,
                        unit: 'metric'
                    });
                    Map.map.addControl(scale, 'top-left');
                    
                    // Add geolocate control
                    const geolocate = new maplibregl.GeolocateControl({
                        positionOptions: {
                            enableHighAccuracy: true
                        },
                        trackUserLocation: true,
                        showUserHeading: true
                    });
                    Map.map.addControl(geolocate, 'top-right');
                    
                    // Handle map load
                    Map.map.on('load', function() {
                        Map._initializeLayers();
                        Map._setupInteractions();
                        resolve(Map.map);
                    });
                    
                    Map.map.on('error', function(e) {
                        console.error('Map error:', e);
                    });
                    
                } catch (error) {
                    console.error('Map initialization error:', error);
                    reject(error);
                }
            });
        },
        
        _initializeLayers: function() {
            // Layer 1: Polygon boundaries
            Map.map.addSource('polygons', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });
            
            // Polygon fill layer
            Map.map.addLayer({
                id: 'polygons-fill',
                type: 'fill',
                source: 'polygons',
                paint: {
                    'fill-color': ['get', 'fillColor'],
                    'fill-opacity': 0.4
                }
            });
            
            // Polygon stroke layer
            Map.map.addLayer({
                id: 'polygons-stroke',
                type: 'line',
                source: 'polygons',
                paint: {
                    'line-color': ['get', 'strokeColor'],
                    'line-width': 2,
                    'line-opacity': 1
                }
            });
            
            // Layer 2: Cameras
            Map.map.addSource('cameras', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                },
                cluster: true,
                clusterMaxZoom: 12,
                clusterRadius: 50
            });
            
            // Camera clusters
            Map.map.addLayer({
                id: 'camera-clusters',
                type: 'circle',
                source: 'cameras',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': '#3b82f6',
                    'circle-radius': [
                        'step',
                        ['get', 'point_count'],
                        15, 5,
                        20, 10,
                        25
                    ],
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                },
                layout: {
                    'visibility': 'visible'
                }
            });
            
            // Camera cluster count
            Map.map.addLayer({
                id: 'camera-cluster-count',
                type: 'symbol',
                source: 'cameras',
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': ['to-string', ['get', 'point_count']],
                    'text-font': ['Noto Sans Regular'],
                    'text-size': 12,
                    'text-allow-overlap': true,
                    'visibility': 'visible'
                },
                paint: {
                    'text-color': '#ffffff',
                    'text-halo-color': '#3b82f6',
                    'text-halo-width': 1
                }
            });
            
            // Individual cameras
            Map.map.addLayer({
                id: 'cameras-layer',
                type: 'circle',
                source: 'cameras',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-radius': 6,
                    'circle-color': ['get', 'color'],
                    'circle-stroke-width': 1.5,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0.9
                },
                layout: {
                    'visibility': 'visible'
                }
            });
            
            // Layer 3: Waze alerts
            Map.map.addSource('waze', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });
            
            Map.map.addLayer({
                id: 'waze-layer',
                type: 'circle',
                source: 'waze',
                paint: {
                    'circle-radius': 10,
                    'circle-color': '#f59e0b',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': ['get', 'opacity']
                },
                layout: {
                    'visibility': 'visible'
                }
            });
            
            // Layer 4: Weather stations
            Map.map.addSource('weather', {
                type: 'geojson',
                data: {
                    type: 'FeatureCollection',
                    features: []
                }
            });
            
            // Weather station circles (rain accumulation)
            Map.map.addLayer({
                id: 'weather-circles',
                type: 'circle',
                source: 'weather',
                paint: {
                    'circle-radius': ['get', 'radius'],
                    'circle-color': ['get', 'color'],
                    'circle-opacity': 0.3,
                    'circle-stroke-width': 0
                },
                layout: {
                    'visibility': 'none'
                }
            });
            
            // Weather station icons
            Map.map.addLayer({
                id: 'weather-layer',
                type: 'circle',
                source: 'weather',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#06b6d4',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                },
                layout: {
                    'visibility': 'none'
                }
            });
            
            // Create popup
            Map.popup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                className: 'map-tooltip',
                offset: 15
            });
        },
        
        _setupInteractions: function() {
            // Polygon interactions
            Map.map.on('mouseenter', 'polygons-fill', function(e) {
                Map.map.getCanvas().style.cursor = 'pointer';
                
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const props = feature.properties;
                    
                    // Get centroid for popup position
                    const bounds = new maplibregl.LngLatBounds();
                    if (feature.geometry.type === 'Polygon') {
                        feature.geometry.coordinates[0].forEach(function(coord) {
                            bounds.extend(coord);
                        });
                    }
                    const center = bounds.getCenter();
                    
                    // Create rich popup
                    const statusInfo = Colors.getStatusColors(props.status);
                    let html = '<div class="text-sm">';
                    html += '<div class="font-semibold text-slate-900 dark:text-white mb-1">' + props.name + '</div>';
                    if (props.neighborhood) {
                        html += '<div class="text-xs text-slate-600 dark:text-slate-400 mb-2">' + props.neighborhood + '</div>';
                    }
                    html += '<div class="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ' + statusInfo.bg + ' ' + statusInfo.text + ' mb-2">';
                    html += statusInfo.name;
                    html += '</div>';
                    
                    // Add stats
                    html += '<div class="mt-2 space-y-1">';
                    if (props.cameraCount > 0) {
                        html += '<div class="text-xs">🎥 ' + props.cameraCount + ` câmera${props.cameraCount > 1 ? 's' : ''} detect${props.cameraCount > 1 ? 'aram' : 'ou'}</div>`;
                    }
                    if (props.wazeCount > 0) {
                        html += '<div class="text-xs">📍 ' + props.wazeCount + ` report${props.wazeCount > 1 ? 's' : ''} Waze</div>`;
                    }
                    if (props.rainAccum > 0) {
                        html += '<div class="text-xs">🌧️ ' + props.rainAccum + 'mm/15min chuva</div>';
                    }
                    html += '</div>';
                    html += '<div class="mt-2 text-xs text-slate-500 dark:text-slate-400">[Clique para detalhes]</div>';
                    html += '</div>';
                    
                    Map.popup.setLngLat(center).setHTML(html).addTo(Map.map);
                }
            });
            
            Map.map.on('mouseleave', 'polygons-fill', function() {
                Map.map.getCanvas().style.cursor = '';
                Map.popup.remove();
            });
            
            // Camera interactions
            Map.map.on('mouseenter', 'cameras-layer', function() {
                Map.map.getCanvas().style.cursor = 'pointer';
            });
            
            Map.map.on('mouseleave', 'cameras-layer', function() {
                Map.map.getCanvas().style.cursor = '';
            });
            
            Map.map.on('click', 'cameras-layer', function(e) {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const props = feature.properties;
                    
                    let html = '<div class="text-sm">';
                    html += '<div class="font-semibold text-slate-900 dark:text-white mb-2">📷 Câmera ' + props.codigo + '</div>';
                    html += '<div class="text-xs text-slate-600 dark:text-slate-400 mb-2">' + (props.name || 'Sem nome') + '</div>';
                    
                    const status = props.label === 1 ? 'Detecção ativa' : props.label === 0 ? 'Normal' : 'Sem dados';
                    const statusColor = props.label === 1 ? 'text-red-600' : props.label === 0 ? 'text-green-600' : 'text-gray-600';
                    html += '<div class="text-xs ' + statusColor + ' font-semibold">' + status + '</div>';
                    // Add camera image
                    html += '<div class="mt-2">';
                    html += '<img src="' + API.getCameraImageUrl(props.codigo) + '" alt="Câmera ' + props.codigo + '" class="w-full h-auto">';
                    html += '</div>';
                    
                    new maplibregl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(html)
                        .addTo(Map.map);
                }
            });
            
            // Camera cluster click - zoom in
            Map.map.on('click', 'camera-clusters', function(e) {
                const features = Map.map.queryRenderedFeatures(e.point, {
                    layers: ['camera-clusters']
                });
                const clusterId = features[0].properties.cluster_id;
                Map.map.getSource('cameras').getClusterExpansionZoom(clusterId, function(err, zoom) {
                    if (err) return;
                    Map.map.easeTo({
                        center: features[0].geometry.coordinates,
                        zoom: zoom
                    });
                });
            });
            
            Map.map.on('mouseenter', 'camera-clusters', function() {
                Map.map.getCanvas().style.cursor = 'pointer';
            });
            
            Map.map.on('mouseleave', 'camera-clusters', function() {
                Map.map.getCanvas().style.cursor = '';
            });
            
            // Waze interactions
            Map.map.on('mouseenter', 'waze-layer', function() {
                Map.map.getCanvas().style.cursor = 'pointer';
            });
            
            Map.map.on('mouseleave', 'waze-layer', function() {
                Map.map.getCanvas().style.cursor = '';
            });
            
            Map.map.on('click', 'waze-layer', function(e) {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const props = feature.properties;
                    
                    let html = '<div class="text-sm">';
                    html += '<div class="font-semibold text-slate-900 dark:text-white mb-2">📍 Alerta Waze</div>';
                    html += '<div class="text-xs text-slate-600 dark:text-slate-400 mb-1">' + (props.street || 'Localização') + '</div>';
                    html += '<div class="text-xs text-slate-600 dark:text-slate-400 mb-1">Confiabilidade: ' + props.reliability + '/10</div>';
                    html += '<div class="text-xs text-slate-500 dark:text-slate-400">' + props.ageMinutes + ' min atrás</div>';
                    html += '</div>';
                    
                    new maplibregl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(html)
                        .addTo(Map.map);
                }
            });
            
            // Weather interactions
            Map.map.on('mouseenter', 'weather-layer', function() {
                Map.map.getCanvas().style.cursor = 'pointer';
            });
            
            Map.map.on('mouseleave', 'weather-layer', function() {
                Map.map.getCanvas().style.cursor = '';
            });
            
            Map.map.on('click', 'weather-layer', function(e) {
                if (e.features.length > 0) {
                    const feature = e.features[0];
                    const props = feature.properties;
                    
                    let html = '<div class="text-sm">';
                    html += '<div class="font-semibold text-slate-900 dark:text-white mb-2">🌡️ ' + props.name + '</div>';
                    html += '<div class="text-xs text-slate-600 dark:text-slate-400 space-y-1">';
                    html += '<div>15 min: ' + props.rain15min + 'mm</div>';
                    html += '<div>1 hora: ' + props.rain1h + 'mm</div>';
                    html += '<div>24 horas: ' + props.rain24h + 'mm</div>';
                    html += '</div>';
                    html += '</div>';
                    
                    new maplibregl.Popup()
                        .setLngLat(e.lngLat)
                        .setHTML(html)
                        .addTo(Map.map);
                }
            });
        },
        
        addPolygonMarkers: function(polygons, onMarkerClick) {
            if (!this.map) return;
            
            // Create GeoJSON features from polygons with actual geometries
            const features = polygons.map(function(polygon) {
                // Use actual polygon geometry if available
                let geometry;
                if (polygon.geometry && Array.isArray(polygon.geometry) && polygon.geometry.length > 0) {
                    // API returns geometry as array of coordinates directly
                    // Format: [[lng, lat], [lng, lat], ...]
                    geometry = {
                        type: 'Polygon',
                        coordinates: polygon.geometry
                    };
                } else if (polygon.geometry && polygon.geometry.coordinates) {
                    // Alternative format: {coordinates: [...]}
                    geometry = {
                        type: 'Polygon',
                        coordinates: polygon.geometry.coordinates
                    };
                } else {
                    // Fallback to point if no geometry
                    geometry = {
                        type: 'Point',
                        coordinates: [polygon.lng_centroid, polygon.lat_centroid]
                    };
                }
                
                const statusCode = polygon.status_code || 0;
                const color = Colors.getStatusHex(statusCode);
                
                return {
                    type: 'Feature',
                    geometry: geometry,
                    properties: {
                        polygonId: polygon.cluster_id,
                        name: polygon.main_route || 'Região',
                        neighborhood: polygon.main_neighborhood || '',
                        fillColor: color,
                        strokeColor: color,
                        status: statusCode,
                        cameraCount: polygon.camera_flood_count || 0,
                        wazeCount: polygon.waze_flood_count || 0,
                        rainAccum: polygon.acumulado_chuva_15_min_1 || 0
                    }
                };
            });
            
            // Update polygons source
            const source = this.map.getSource('polygons');
            if (source) {
                source.setData({
                    type: 'FeatureCollection',
                    features: features
                });
            }
            
            // Store polygons for reference
            this.markers = {};
            polygons.forEach(function(polygon) {
                Map.markers[polygon.cluster_id] = polygon;
            });
            
            // Add click handler for polygons
            if (onMarkerClick) {
                Map.map.off('click', 'polygons-fill', Map._polygonClickHandler);
                
                Map._polygonClickHandler = function(e) {
                    // Check if we clicked on a camera first - cameras should take priority
                    const cameraFeatures = Map.map.queryRenderedFeatures(e.point, {
                        layers: ['cameras-layer']
                    });
                    
                    if (cameraFeatures.length > 0) {
                        return; // Don't handle polygon click if camera was clicked
                    }
                    
                    // Check if we clicked on a Waze alert - Waze alerts should take priority
                    const wazeFeatures = Map.map.queryRenderedFeatures(e.point, {
                        layers: ['waze-layer']
                    });
                    
                    if (wazeFeatures.length > 0) {
                        return; // Don't handle polygon click if Waze alert was clicked
                    }
                    
                    if (e.features.length > 0) {
                        const feature = e.features[0];
                        const polygonId = feature.properties.polygonId;
                        
                        // Add ripple effect at click point
                        Map._addRippleEffect(e.lngLat);
                        
                        onMarkerClick(polygonId);
                    }
                };
                
                Map.map.on('click', 'polygons-fill', Map._polygonClickHandler);
            }
            
            // Start pulse animation for critical polygons
            Map._startPulseAnimation();
        },
        
        loadCameras: async function() {
            try {
                this.cameras = await API.getCameras();
                this._updateCameraLayer();
            } catch (error) {
                console.error('Error loading cameras:', error);
            }
        },
        
        _updateCameraLayer: function() {
            if (!this.map || !this.cameras) return;
            
            const features = this.cameras.map(function(camera) {
                let color = '#9ca3af'; // gray - no data
                if (camera.label === 1) color = '#ef4444'; // red - flood detected
                else if (camera.label === 0) color = '#10b981'; // green - normal
                
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [camera.Longitude, camera.Latitude]
                    },
                    properties: {
                        codigo: camera.Codigo,
                        name: camera['Nome da Camera'] || '',
                        label: camera.label,
                        color: color,
                        clusterId: camera.cluster_id
                    }
                };
            });
            
            const source = this.map.getSource('cameras');
            if (source) {
                source.setData({
                    type: 'FeatureCollection',
                    features: features
                });
            }
        },
        
        loadWazeAlerts: async function() {
            try {
                const response = await fetch(CONFIG.apiBaseUrl + '/waze/alerts');
                const alerts = await response.json();
                
                // Filter for flood alerts only and apply age filter (30 min max)
                const now = new Date();
                this.wazeAlerts = alerts.filter(function(alert) {
                    if (alert.subtype !== 'HAZARD_WEATHER_FLOOD') return false;
                    
                    const alertTime = new Date(alert.pubMillis);
                    const ageMinutes = (now - alertTime) / 60000;
                    return ageMinutes <= 30;
                });
                
                this._updateWazeLayer();
            } catch (error) {
                console.error('Error loading Waze alerts:', error);
            }
        },
        
        _updateWazeLayer: function() {
            if (!this.map || !this.wazeAlerts) return;
            
            const now = new Date();
            const features = this.wazeAlerts.map(function(alert) {
                const alertTime = new Date(alert.pubMillis);
                const ageMinutes = (now - alertTime) / 60000;
                
                // Calculate opacity based on age
                let opacity = 1.0;
                if (ageMinutes > 20) opacity = 0.4;
                else if (ageMinutes > 10) opacity = 0.7;
                
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [alert.longitude, alert.latitude]
                    },
                    properties: {
                        uuid: alert.uuid,
                        street: alert.street || 'Sem endereço',
                        reliability: alert.reliability || 0,
                        ageMinutes: Math.round(ageMinutes),
                        opacity: opacity
                    }
                };
            });
            
            const source = this.map.getSource('waze');
            if (source) {
                source.setData({
                    type: 'FeatureCollection',
                    features: features
                });
            }
        },
        
        loadWeatherStations: async function() {
            try {
                const response = await fetch(CONFIG.apiBaseUrl + '/stations/alertario/api');
                this.weatherStations = await response.json();
                this._updateWeatherLayer();
            } catch (error) {
                console.error('Error loading weather stations:', error);
            }
        },
        
        _updateWeatherLayer: function() {
            if (!this.map || !this.weatherStations) return;
            
            const features = this.weatherStations.map(function(station) {
                const rain15min = station.acumulado_chuva_15_min || 0;
                const rain1h = station.acumulado_chuva_1_h || 0;
                const rain24h = station.acumulado_chuva_24_h || 0;
                
                // Calculate circle radius based on 15min accumulation
                const radius = Math.min(20 + (rain15min * 8), 100);
                
                // Color gradient based on 1h accumulation
                let color = '#bfdbfe'; // light blue
                if (rain1h > 20) color = '#1e40af'; // deep blue
                else if (rain1h > 10) color = '#3b82f6'; // medium blue
                else if (rain1h > 5) color = '#60a5fa'; // light-medium blue
                
                return {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [station.longitude, station.latitude]
                    },
                    properties: {
                        name: station.estacao,
                        rain15min: rain15min.toFixed(1),
                        rain1h: rain1h.toFixed(1),
                        rain24h: rain24h.toFixed(1),
                        radius: radius,
                        color: color
                    }
                };
            });
            
            const source = this.map.getSource('weather');
            if (source) {
                source.setData({
                    type: 'FeatureCollection',
                    features: features
                });
            }
        },
        
        toggleLayer: function(layerName, visible) {
            if (!this.map) return;
            
            this.layerVisibility[layerName] = visible;
            const visibility = visible ? 'visible' : 'none';
            
            switch(layerName) {
                case 'polygons':
                    this.map.setLayoutProperty('polygons-fill', 'visibility', visibility);
                    this.map.setLayoutProperty('polygons-stroke', 'visibility', visibility);
                    break;
                case 'cameras':
                    this.map.setLayoutProperty('cameras-layer', 'visibility', visibility);
                    this.map.setLayoutProperty('camera-clusters', 'visibility', visibility);
                    this.map.setLayoutProperty('camera-cluster-count', 'visibility', visibility);
                    break;
                case 'waze':
                    this.map.setLayoutProperty('waze-layer', 'visibility', visibility);
                    if (visible && this.wazeAlerts.length === 0) {
                        this.loadWazeAlerts();
                    }
                    break;
                case 'weather':
                    this.map.setLayoutProperty('weather-layer', 'visibility', visibility);
                    this.map.setLayoutProperty('weather-circles', 'visibility', visibility);
                    if (visible && this.weatherStations.length === 0) {
                        this.loadWeatherStations();
                    }
                    break;
            }
        },
        
        toggle3DMode: function() {
            if (!this.map) return;
            
            this.is3DMode = !this.is3DMode;
            
            if (this.is3DMode) {
                this.map.easeTo({
                    pitch: 45,
                    bearing: -17.6,
                    duration: 1000
                });
                
                // Add 3D extrusion to polygons
                if (this.map.getLayer('polygons-3d')) {
                    this.map.setLayoutProperty('polygons-3d', 'visibility', 'visible');
                } else {
                    this.map.addLayer({
                        id: 'polygons-3d',
                        type: 'fill-extrusion',
                        source: 'polygons',
                        paint: {
                            'fill-extrusion-color': ['get', 'fillColor'],
                            'fill-extrusion-height': [
                                'case',
                                ['>=', ['get', 'status'], 3], 500,
                                ['>=', ['get', 'status'], 2], 300,
                                ['>=', ['get', 'status'], 1], 100,
                                0
                            ],
                            'fill-extrusion-opacity': 0.6
                        }
                    }, 'polygons-fill');
                }
                
                // Hide 2D layers
                this.map.setLayoutProperty('polygons-fill', 'visibility', 'none');
                this.map.setLayoutProperty('polygons-stroke', 'visibility', 'none');
            } else {
                this.map.easeTo({
                    pitch: 0,
                    bearing: 0,
                    duration: 1000
                });
                
                // Hide 3D layer
                if (this.map.getLayer('polygons-3d')) {
                    this.map.setLayoutProperty('polygons-3d', 'visibility', 'none');
                }
                
                // Show 2D layers
                this.map.setLayoutProperty('polygons-fill', 'visibility', 'visible');
                this.map.setLayoutProperty('polygons-stroke', 'visibility', 'visible');
            }
        },
        
        _startPulseAnimation: function() {
            if (this.pulseAnimationId) {
                cancelAnimationFrame(this.pulseAnimationId);
            }
            
            let opacity = 0.4;
            let increasing = true;
            
            const animate = function() {
                if (!Map.map || !Map.map.getLayer('polygons-fill')) return;
                
                if (increasing) {
                    opacity += 0.01;
                    if (opacity >= 0.6) increasing = false;
                } else {
                    opacity -= 0.01;
                    if (opacity <= 0.2) increasing = true;
                }
                
                // Only pulse polygons with status >= 2
                try {
                    Map.map.setPaintProperty('polygons-fill', 'fill-opacity', [
                        'case',
                        ['>=', ['get', 'status'], 2],
                        opacity,
                        0.4
                    ]);
                } catch (e) {
                    // Layer might not be ready yet
                }
                
                Map.pulseAnimationId = requestAnimationFrame(animate);
            };
            
            animate();
        },
        
        _addRippleEffect: function(lngLat) {
            const rippleId = 'ripple-' + Date.now();
            
            this.map.addSource(rippleId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: {
                        type: 'Point',
                        coordinates: [lngLat.lng, lngLat.lat]
                    }
                }
            });
            
            this.map.addLayer({
                id: rippleId,
                type: 'circle',
                source: rippleId,
                paint: {
                    'circle-radius': 5,
                    'circle-color': '#0ea5e9',
                    'circle-opacity': 0.8
                }
            });
            
            let radius = 5;
            const animate = function() {
                radius += 2;
                const opacity = Math.max(0, 0.8 - (radius / 50));
                
                if (Map.map.getLayer(rippleId)) {
                    Map.map.setPaintProperty(rippleId, 'circle-radius', radius);
                    Map.map.setPaintProperty(rippleId, 'circle-opacity', opacity);
                }
                
                if (radius < 50) {
                    requestAnimationFrame(animate);
                } else {
                    if (Map.map.getLayer(rippleId)) {
                        Map.map.removeLayer(rippleId);
                    }
                    if (Map.map.getSource(rippleId)) {
                        Map.map.removeSource(rippleId);
                    }
                }
            };
            
            requestAnimationFrame(animate);
        },
        
        centerMap: function(lng, lat, zoom, duration) {
            if (!this.map) return;
            
            this.map.flyTo({
                center: [lng, lat],
                zoom: zoom || 14,
                duration: duration || 2000,
                essential: true,
                easing: function(t) {
                    return t * (2 - t);
                }
            });
        },
        
        resize: function() {
            if (this.map) {
                this.map.resize();
            }
        },
        
        fitBounds: function(bounds, options) {
            if (this.map && bounds) {
                this.map.fitBounds(bounds, {
                    padding: options?.padding || 50,
                    duration: options?.duration || 1000,
                    maxZoom: options?.maxZoom || 15
                });
            }
        },
        
        destroy: function() {
            if (this.pulseAnimationId) {
                cancelAnimationFrame(this.pulseAnimationId);
            }
            if (this.map) {
                this.map.remove();
                this.map = null;
                this.markers = {};
                this.cameras = [];
                this.wazeAlerts = [];
                this.weatherStations = [];
            }
        }
    };
    
    // ===========================================
    // UI COMPONENTS
    // ===========================================
    
    const UI = {
        updateStatistics: function(stats) {
            const totalRegionsEl = document.getElementById('totalRegions');
            const activeAlertsEl = document.getElementById('activeAlerts');
            const aiDetectionsEl = document.getElementById('aiDetections');
            const wazeReportsEl = document.getElementById('wazeReports');
            
            if (totalRegionsEl) totalRegionsEl.textContent = stats.totalRegions || 0;
            if (activeAlertsEl) activeAlertsEl.textContent = stats.activeAlerts || 0;
            if (aiDetectionsEl) aiDetectionsEl.textContent = stats.aiDetections || 0;
            if (wazeReportsEl) wazeReportsEl.textContent = stats.wazeReports || 0;
            
            const badge = document.getElementById('alertBadge');
            if (badge) {
                const unreadCount = stats.unreadNotifications || 0;
                if (unreadCount > 0) {
                    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        },
        
        renderNotifications: function(polygons, containerId) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            const unreadNotifications = Notifications.getUnreadNotifications(polygons);
            
            container.innerHTML = '';
            
            if (unreadNotifications.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-8 px-4">
                        <svg class="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">Nenhuma notificação nova</p>
                        <p class="mt-1 text-xs text-slate-500 dark:text-slate-500">Você está em dia!</p>
                    </div>
                `;
                return;
            }
            
            // Sort by status code (critical first) then by timestamp
            unreadNotifications.sort(function(a, b) {
                if (b.status_code !== a.status_code) {
                    return b.status_code - a.status_code;
                }
                return new Date(b.timestamp) - new Date(a.timestamp);
            });
            
            unreadNotifications.forEach(function(polygon) {
                const colors = Colors.getStatusColors(polygon.status_code);
                const notificationEl = document.createElement('div');
                notificationEl.className = 'p-4 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer';
                notificationEl.dataset.clusterId = polygon.cluster_id;
                
                const hasWaze = (polygon.waze_flood_count || 0) > 0;
                const hasAI = (polygon.camera_flood_count || 0) > 0;
                
                let sourceText = '';
                if (hasWaze && hasAI) {
                    sourceText = '📍 Waze + 🎥 IA';
                } else if (hasWaze) {
                    sourceText = '📍 Waze';
                } else if (hasAI) {
                    sourceText = '🎥 IA';
                }
                
                notificationEl.innerHTML = `
                    <div class="flex items-start justify-between mb-2">
                        <span class="inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${colors.bg} ${colors.text}">
                            ${colors.name}
                        </span>
                        <span class="text-xs text-slate-500 dark:text-slate-400">${DateTime.getRelativeTime(polygon.timestamp)}</span>
                    </div>
                    <h4 class="font-semibold text-slate-900 dark:text-white text-sm mb-1">
                        ${polygon.main_route || 'Região sem nome'}
                    </h4>
                    <p class="text-xs text-slate-600 dark:text-slate-400 mb-2">
                        ${polygon.main_neighborhood || polygon.main_street_number_range || '--'}
                    </p>
                    <div class="flex items-center justify-between">
                        <span class="text-xs text-slate-600 dark:text-slate-300">${sourceText}</span>
                        <button 
                            class="mark-read-btn text-xs text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 font-medium"
                            data-cluster-id="${polygon.cluster_id}"
                            onclick="event.stopPropagation()"
                        >
                            Marcar como lida
                        </button>
                    </div>
                `;
                
                container.appendChild(notificationEl);
            });
        },
        
        createRegionCard: function(polygon, onClick) {
            const colors = Colors.getStatusColors(polygon.status_code);
            const card = document.createElement('div');
            card.className = 'bg-white dark:bg-slate-800 rounded-lg shadow-sm border-2 ' + colors.border + ' p-6 hover:shadow-md transition-all cursor-pointer card-hover';
            
            card.innerHTML = `
                <div class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text} mb-3">
                    ${colors.name}
                </div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">${polygon.main_route || 'Região sem nome'}</h3>
                <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">${polygon.main_neighborhood || polygon.main_street_number_range || '--'}</p>
                <div class="space-y-2">
                    ${polygon.camera_flood_count > 0 ? `
                        <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-600 dark:text-slate-400">🎥 Câmeras com detecção</span>
                            <span class="font-semibold text-slate-900 dark:text-white">${polygon.camera_flood_count}</span>
                        </div>
                    ` : ''}
                    ${polygon.waze_flood_count > 0 ? `
                        <div class="flex items-center justify-between text-sm">
                            <span class="text-slate-600 dark:text-slate-400">📍 Reports Waze</span>
                            <span class="font-semibold text-slate-900 dark:text-white">${polygon.waze_flood_count}</span>
                        </div>
                    ` : ''}
                    ${!polygon.camera_flood_count && !polygon.waze_flood_count ? `
                        <p class="text-sm text-slate-500 dark:text-slate-400 italic">Nenhum alerta ativo</p>
                    ` : ''}
                </div>
                <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span class="text-xs text-slate-500 dark:text-slate-400">
                        Atualizado ${DateTime.getRelativeTime(polygon.timestamp)}
                    </span>
                    <span class="text-brand-500 hover:text-brand-600 dark:text-brand-400 text-sm font-medium">
                        Ver detalhes →
                    </span>
                </div>
            `;
            
            card.addEventListener('click', function() { onClick(polygon); });
            return card;
        },
        
        renderRegionCards: function(polygons, containerId, onClick) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            container.innerHTML = '';
            
            if (!polygons || polygons.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full text-center py-12">
                        <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                        <h3 class="mt-2 text-sm font-medium text-slate-900 dark:text-white">Nenhuma região encontrada</h3>
                        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Tente ajustar os filtros de busca</p>
                    </div>
                `;
                return;
            }
            
            polygons.forEach(function(polygon) {
                container.appendChild(UI.createRegionCard(polygon, onClick));
            });
        },
        
        renderCriticalAlerts: async function(containerId, onClick) {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            try {
                const alerts = await API.getCriticalAlerts(10);
                container.innerHTML = '';
                
                if (!alerts || alerts.length === 0) {
                    container.innerHTML = `
                        <div class="text-center py-8">
                            <svg class="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <h3 class="mt-2 text-sm font-medium text-slate-900 dark:text-white">Nenhum alerta crítico</h3>
                            <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Todas as regiões estão normais</p>
                        </div>
                    `;
                    return;
                }
                
                alerts.forEach(function(alert) {
                    const colors = Colors.getStatusColors(alert.status_code);
                    const card = document.createElement('div');
                    card.className = 'border-l-4 ' + colors.border + ' bg-slate-50 dark:bg-slate-700/50 rounded-r-lg p-4 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer';
                    card.innerHTML = `
                        <div class="flex items-start justify-between mb-2">
                            <span class="inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${colors.bg} ${colors.text}">${colors.name}</span>
                            <span class="text-xs text-slate-500 dark:text-slate-400">${DateTime.getRelativeTime(alert.timestamp)}</span>
                        </div>
                        <h4 class="font-semibold text-slate-900 dark:text-white text-sm mb-1">${alert.main_route || 'Região sem nome'}</h4>
                        <p class="text-xs text-slate-600 dark:text-slate-400 mb-2">${alert.main_neighborhood || '--'}</p>
                        ${alert.camera_flood_count > 0 ? `<p class="text-xs text-slate-600 dark:text-slate-300">🎥 ${alert.camera_flood_count} câmera(s) com detecção</p>` : ''}
                        ${alert.waze_flood_count > 0 ? `<p class="text-xs text-slate-600 dark:text-slate-300">📍 ${alert.waze_flood_count} report(s) Waze</p>` : ''}
                    `;
                    card.addEventListener('click', function() { onClick(alert); });
                    container.appendChild(card);
                });
            } catch (error) {
                console.error('Error rendering alerts:', error);
            }
        },
        
        showToast: function(message, type) {
            const container = document.getElementById('toastContainer');
            if (!container) return;
            
            const colors = {
                success: 'bg-green-500',
                error: 'bg-red-500',
                warning: 'bg-yellow-500',
                info: 'bg-blue-500'
            };
            
            const icons = {
                success: '✓',
                error: '✕',
                warning: '⚠',
                info: 'ℹ'
            };
            
            const toast = document.createElement('div');
            toast.className = colors[type] + ' text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-3 toast-enter';
            toast.innerHTML = `
                <span class="text-xl">${icons[type]}</span>
                <span class="font-medium">${message}</span>
            `;
            
            container.appendChild(toast);
            
            setTimeout(function() {
                toast.classList.add('toast-exit');
                setTimeout(function() { toast.remove(); }, 300);
            }, 3000);
        }
    };
    
    // ===========================================
    // MODAL
    // ===========================================
    
    const Modal = {
        currentPolygon: null,
        cameraRefreshInterval: null,
        modalMap: null,
        
        open: async function(polygon) {
            this.currentPolygon = polygon;
            const modal = document.getElementById('regionModal');
            if (!modal) return;
            
            document.getElementById('modalRegionName').textContent = polygon.main_route || 'Região sem nome';
            document.getElementById('modalRegionNeighborhood').textContent = polygon.main_neighborhood || '--';
            
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            
            this.switchTab('overview');
            await this.loadOverviewTab(polygon);
        },
        
        close: function() {
            const modal = document.getElementById('regionModal');
            if (!modal) return;
            
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            
            if (this.cameraRefreshInterval) {
                clearInterval(this.cameraRefreshInterval);
                this.cameraRefreshInterval = null;
            }
            
            // Clean up camera state to free memory
            if (this.cameraState) {
                this.cameraState = null;
            }
            
            // Clean up modal map
            if (this.modalMap) {
                this.modalMap.remove();
                this.modalMap = null;
            }
            
            this.currentPolygon = null;
        },
        
        switchTab: function(tabName) {
            document.querySelectorAll('.modal-tab').forEach(function(btn) {
                if (btn.dataset.tab === tabName) {
                    btn.classList.add('active', 'border-brand-500', 'text-brand-600', 'dark:text-brand-400');
                    btn.classList.remove('border-transparent', 'text-slate-500', 'dark:text-slate-400');
                } else {
                    btn.classList.remove('active', 'border-brand-500', 'text-brand-600', 'dark:text-brand-400');
                    btn.classList.add('border-transparent', 'text-slate-500', 'dark:text-slate-400');
                }
            });
            
            document.querySelectorAll('.tab-content').forEach(function(content) {
                content.classList.add('hidden');
            });
            
            const activeTab = document.getElementById(tabName + 'Tab');
            if (activeTab) activeTab.classList.remove('hidden');
            
            if (this.currentPolygon) {
                if (tabName === 'overview') this.loadOverviewTab(this.currentPolygon);
                else if (tabName === 'alerts') this.loadAlertsTab(this.currentPolygon);
                else if (tabName === 'cameras') this.loadCamerasTab(this.currentPolygon);
            }
        },
        
        loadOverviewTab: async function(polygon) {
            const colors = Colors.getStatusColors(polygon.status_code);
            const statusEl = document.getElementById('modalStatus');
            if (statusEl) {
                statusEl.className = 'p-4 rounded-lg ' + colors.bg + ' border-2 ' + colors.border;
                statusEl.innerHTML = `
                    <div class="flex items-center justify-between">
                        <div>
                            <p class="text-sm font-medium ${colors.text} mb-1">Status Atual</p>
                            <p class="text-2xl font-bold ${colors.text}">${colors.name}</p>
                        </div>
                    </div>
                `;
            }
            
            const metricsEl = document.getElementById('modalMetrics');
            if (metricsEl) {
                metricsEl.innerHTML = `
                    <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <span class="text-sm text-slate-600 dark:text-slate-300">🎥 Câmeras com detecção</span>
                        <span class="text-sm font-semibold text-slate-900 dark:text-white">${polygon.camera_flood_count || 0}</span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <span class="text-sm text-slate-600 dark:text-slate-300">📍 Reports Waze</span>
                        <span class="text-sm font-semibold text-slate-900 dark:text-white">${polygon.waze_flood_count || 0}</span>
                    </div>
                    <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <span class="text-sm text-slate-600 dark:text-slate-300">🕐 Última atualização</span>
                        <span class="text-sm font-semibold text-slate-900 dark:text-white">${DateTime.getRelativeTime(polygon.timestamp)}</span>
                    </div>
                `;
            }
            
            // Initialize modal map
            await this.initModalMap(polygon);
        },
        
        initModalMap: async function(polygon) {
            // Clean up existing map if any
            if (this.modalMap) {
                this.modalMap.remove();
                this.modalMap = null;
            }
            
            const modalMapContainer = document.getElementById('modalMap');
            if (!modalMapContainer) return;
            
            // Check if MapLibre is loaded
            if (typeof maplibregl === 'undefined') {
                console.error('MapLibre GL JS not loaded');
                modalMapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-sm text-slate-500 dark:text-slate-400">Mapa não disponível</div>';
                return;
            }
            
            try {
                // Initialize MapLibre map for modal
                this.modalMap = new maplibregl.Map({
                    container: 'modalMap',
                    style: {
                        version: 8,
                        sources: {
                            'osm': {
                                type: 'raster',
                                tiles: [
                                    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                                ],
                                tileSize: 256,
                                attribution: '© OpenStreetMap contributors'
                            }
                        },
                        layers: [
                            {
                                id: 'osm-tiles',
                                type: 'raster',
                                source: 'osm',
                                minzoom: 0,
                                maxzoom: 19
                            }
                        ]
                    },
                    center: [polygon.lng_centroid || -43.2, polygon.lat_centroid || -22.9],
                    zoom: 14,
                    interactive: true,
                    attributionControl: false
                });
                
                // Add marker for the polygon location
                this.modalMap.on('load', function() {
                    // Add a marker at the polygon center
                    const markerColor = Colors.getStatusHex(polygon.status_code);
                    
                    Modal.modalMap.addSource('modal-marker', {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [polygon.lng_centroid, polygon.lat_centroid]
                            }
                        }
                    });
                    
                    // Add glow layer
                    Modal.modalMap.addLayer({
                        id: 'modal-marker-glow',
                        type: 'circle',
                        source: 'modal-marker',
                        paint: {
                            'circle-radius': 20,
                            'circle-color': markerColor,
                            'circle-opacity': 0.2,
                            'circle-blur': 1
                        }
                    });
                    
                    // Add main marker layer
                    Modal.modalMap.addLayer({
                        id: 'modal-marker-layer',
                        type: 'circle',
                        source: 'modal-marker',
                        paint: {
                            'circle-radius': 12,
                            'circle-color': markerColor,
                            'circle-stroke-width': 3,
                            'circle-stroke-color': '#ffffff',
                            'circle-opacity': 0.9
                        }
                    });
                });
                
            } catch (error) {
                console.error('Modal map initialization error:', error);
                modalMapContainer.innerHTML = '<div class="flex items-center justify-center h-full text-sm text-slate-500 dark:text-slate-400">Erro ao carregar mapa</div>';
            }
        },
        
        loadAlertsTab: function(polygon) {
            const alertsListEl = document.getElementById('modalAlertsList');
            if (!alertsListEl) return;
            
            let html = '';
            
            if (polygon.camera_flood_count > 0) {
                html += `
                    <div class="flex items-start space-x-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div class="flex-shrink-0 w-10 h-10 bg-white dark:bg-slate-600 rounded-full flex items-center justify-center text-xl">🎥</div>
                        <div class="flex-1">
                            <p class="text-sm font-semibold text-slate-900 dark:text-white">Detecção por IA</p>
                            <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">${polygon.camera_flood_count} câmera(s) detectaram acúmulo de água</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${DateTime.getRelativeTime(polygon.timestamp)}</p>
                        </div>
                    </div>
                `;
            }
            
            if (polygon.waze_flood_count > 0) {
                html += `
                    <div class="flex items-start space-x-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div class="flex-shrink-0 w-10 h-10 bg-white dark:bg-slate-600 rounded-full flex items-center justify-center text-xl">📍</div>
                        <div class="flex-1">
                            <p class="text-sm font-semibold text-slate-900 dark:text-white">Reports Waze</p>
                            <p class="text-sm text-slate-600 dark:text-slate-300 mt-1">${polygon.waze_flood_count} report(s) de alagamento</p>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${DateTime.getRelativeTime(polygon.timestamp)}</p>
                        </div>
                    </div>
                `;
            }
            
            if (!html) {
                html = `
                    <div class="text-center py-8">
                        <svg class="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">Nenhum alerta ativo nesta região</p>
                    </div>
                `;
            }
            
            alertsListEl.innerHTML = html;
        },
        
        loadCamerasTab: async function(polygon) {
            const camerasGridEl = document.getElementById('modalCamerasGrid');
            const cameraCountEl = document.getElementById('modalCameraCount');
            const paginationEl = document.getElementById('cameraPagination');
            
            if (!camerasGridEl) return;
            
            try {
                camerasGridEl.innerHTML = '<div class="col-span-full flex items-center justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div></div>';
                
                const cameras = await API.getCamerasForPolygon(polygon.cluster_id);
                
                // Store cameras in modal state for pagination
                if (!Modal.cameraState) Modal.cameraState = {};
                Modal.cameraState.allCameras = cameras;
                Modal.cameraState.currentPage = 1;
                Modal.cameraState.camerasPerPage = 6; // Load 6 cameras at a time to avoid memory overload
                
                if (cameraCountEl) cameraCountEl.textContent = cameras.length;
                
                if (cameras.length === 0) {
                    camerasGridEl.innerHTML = `
                        <div class="col-span-full text-center py-8">
                            <svg class="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                            </svg>
                            <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">Nenhuma câmera disponível nesta região</p>
                        </div>
                    `;
                    if (paginationEl) paginationEl.innerHTML = '';
                    return;
                }
                
                // Render first page
                Modal.renderCameraPage();
                
            } catch (error) {
                console.error('Error loading cameras:', error);
                camerasGridEl.innerHTML = `
                    <div class="col-span-full text-center py-8">
                        <svg class="mx-auto h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">Erro ao carregar câmeras</p>
                    </div>
                `;
            }
        },
        
        renderCameraPage: function() {
            const camerasGridEl = document.getElementById('modalCamerasGrid');
            const paginationEl = document.getElementById('cameraPagination');
            
            if (!camerasGridEl || !this.cameraState) return;
            
            const { allCameras, currentPage, camerasPerPage } = this.cameraState;
            const totalPages = Math.ceil(allCameras.length / camerasPerPage);
            const startIdx = (currentPage - 1) * camerasPerPage;
            const endIdx = Math.min(startIdx + camerasPerPage, allCameras.length);
            const camerasToShow = allCameras.slice(startIdx, endIdx);
            
            // Clear grid
            camerasGridEl.innerHTML = '';
            
            // Render cameras for current page
            camerasToShow.forEach(function(camera) {
                const cameraEl = document.createElement('div');
                cameraEl.className = 'bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden';
                cameraEl.innerHTML = `
                    <iframe src="${API.getCameraImageUrl(camera.Codigo)}" class="w-full h-64 border-0" loading="lazy" title="Câmera ${camera.Codigo}"></iframe>
                    <div class="p-2 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300">Câmera ${camera.Codigo}</div>
                `;
                camerasGridEl.appendChild(cameraEl);
            });
            
            // Render pagination controls
            if (paginationEl && totalPages > 1) {
                paginationEl.innerHTML = `
                    <div class="flex items-center justify-between mt-4">
                        <div class="text-sm text-slate-600 dark:text-slate-400">
                            Mostrando ${startIdx + 1}-${endIdx} de ${allCameras.length} câmeras
                        </div>
                        <div class="flex items-center space-x-2">
                            <button id="prevCameraPage" class="px-3 py-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === 1 ? 'disabled' : ''}>
                                ← Anterior
                            </button>
                            <span class="text-sm text-slate-600 dark:text-slate-400">
                                Página ${currentPage} de ${totalPages}
                            </span>
                            <button id="nextCameraPage" class="px-3 py-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === totalPages ? 'disabled' : ''}>
                                Próxima →
                            </button>
                        </div>
                    </div>
                `;
                
                // Add event listeners for pagination buttons
                const prevBtn = document.getElementById('prevCameraPage');
                const nextBtn = document.getElementById('nextCameraPage');
                
                if (prevBtn) {
                    prevBtn.addEventListener('click', function() {
                        if (Modal.cameraState.currentPage > 1) {
                            Modal.cameraState.currentPage--;
                            Modal.renderCameraPage();
                        }
                    });
                }
                
                if (nextBtn) {
                    nextBtn.addEventListener('click', function() {
                        if (Modal.cameraState.currentPage < totalPages) {
                            Modal.cameraState.currentPage++;
                            Modal.renderCameraPage();
                        }
                    });
                }
            } else if (paginationEl) {
                paginationEl.innerHTML = '';
            }
        },
        
        init: function() {
            const closeBtn = document.getElementById('closeModalBtn');
            if (closeBtn) {
                closeBtn.addEventListener('click', function() { Modal.close(); });
            }
            
            document.querySelectorAll('.modal-tab').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    Modal.switchTab(btn.dataset.tab);
                });
            });
            
            const modal = document.getElementById('regionModal');
            if (modal) {
                modal.addEventListener('click', function(e) {
                    if (e.target === modal) Modal.close();
                });
            }
            
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
                    Modal.close();
                }
            });
        }
    };
    
    // ===========================================
    // APPLICATION STATE & INITIALIZATION
    // ===========================================
    
    const App = {
        state: {
            user: null,
            polygons: [],
            filteredPolygons: [],
            selectedPolygon: null,
            preferences: null,
            autoRefreshInterval: null
        },
        
        init: async function() {
            console.log('🚀 Initializing Rio Flood Monitor...');
            
            try {
                this.showLoadingOverlay(true);
                
                // Auth - Check if user is authenticated
                if (!Auth.isAuthenticated()) {
                    console.log('❌ User not authenticated, redirecting to login...');
                    window.location.href = 'login.html';
                    return;
                }
                
                this.state.user = await Auth.getCurrentUser();
                if (!this.state.user) {
                    console.log('❌ Failed to get user details, redirecting to login...');
                    Auth.logout();
                    return;
                }

                console.log('✅ User authenticated:', this.state.user._id || this.state.user.email);
                
                // Preferences
                this.state.preferences = Storage.getPreferences();
                this.applyPreferences();
                
                // UI
                this.initializeUI();
                
                // Data
                await this.loadData();
                
                // Map
                await this.initializeMap();
                
                // Auto-refresh
                this.setupAutoRefresh();
                
                this.showLoadingOverlay(false);
                console.log('✅ Application initialized');
                
            } catch (error) {
                console.error('❌ Init error:', error);
                this.showLoadingOverlay(false);
                UI.showToast('Erro ao inicializar aplicação', 'error');
            }
        },
        
        initializeUI: function() {
            const self = this;
            
            // User menu
            const userInitials = document.getElementById('userInitials');
            if (userInitials && this.state.user) {
                userInitials.textContent = Auth.getUserInitials(this.state.user);
            }
            
            const userMenuButton = document.getElementById('userMenuButton');
            const userMenuDropdown = document.getElementById('userMenuDropdown');
            if (userMenuButton && userMenuDropdown) {
                userMenuButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    userMenuDropdown.classList.toggle('hidden');
                });
                document.addEventListener('click', function() {
                    userMenuDropdown.classList.add('hidden');
                });
            }
            
            // Logout buttons
            const logoutButton = document.getElementById('logoutButton');
            const logoutButtonMobile = document.getElementById('logoutButtonMobile');
            if (logoutButton) logoutButton.addEventListener('click', function() { Auth.logout(); });
            if (logoutButtonMobile) logoutButtonMobile.addEventListener('click', function() { Auth.logout(); });
            
            // Theme toggle
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', function() {
                    const html = document.documentElement;
                    const isDark = html.classList.contains('dark');
                    if (isDark) {
                        html.classList.remove('dark');
                        self.state.preferences.theme = 'light';
                    } else {
                        html.classList.add('dark');
                        self.state.preferences.theme = 'dark';
                    }
                    Storage.setPreferences(self.state.preferences);
                });
            }
            
            // Search
            const searchInput = document.getElementById('globalSearch');
            if (searchInput) {
                let searchTimeout;
                searchInput.addEventListener('input', function(e) {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(async function() {
                        const query = e.target.value.trim();
                        if (query.length === 0) {
                            self.state.filteredPolygons = [...self.state.polygons];
                        } else if (query.length >= 2) {
                            self.state.filteredPolygons = await API.searchPolygons(query);
                        } else {
                            return;
                        }
                        UI.renderRegionCards(self.state.filteredPolygons, 'regionsGrid', function(p) { self.handleRegionClick(p); });
                    }, 300);
                });
            }
            
            // Filters
            const statusFilter = document.getElementById('statusFilter');
            const sortBy = document.getElementById('sortBy');
            if (statusFilter) statusFilter.addEventListener('change', function() { self.applyFilters(); });
            if (sortBy) sortBy.addEventListener('change', function() { self.applyFilters(); });
            
            // Refresh button
            const refreshButton = document.getElementById('refreshButton');
            if (refreshButton) {
                refreshButton.addEventListener('click', async function() {
                    refreshButton.disabled = true;
                    refreshButton.innerHTML = '<svg class="h-4 w-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg><span>Atualizando...</span>';
                    await self.loadData();
                    refreshButton.disabled = false;
                    refreshButton.innerHTML = '<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg><span>Atualizar</span>';
                    UI.showToast('Dados atualizados', 'success');
                });
            }
            
            // Map fullscreen toggle
            const mapFullscreenBtn = document.getElementById('mapFullscreenBtn');
            if (mapFullscreenBtn) {
                mapFullscreenBtn.addEventListener('click', function() {
                    self.toggleMapFullscreen();
                });
            }
            
            // Map 3D toggle
            const map3DToggle = document.getElementById('map3DToggle');
            if (map3DToggle) {
                map3DToggle.addEventListener('click', function() {
                    Map.toggle3DMode();
                });
            }
            
            // Map layers toggle
            const mapLayersToggle = document.getElementById('mapLayersToggle');
            const mapLayersPanel = document.getElementById('mapLayersPanel');
            if (mapLayersToggle && mapLayersPanel) {
                mapLayersToggle.addEventListener('click', function(e) {
                    e.stopPropagation();
                    mapLayersPanel.classList.toggle('hidden');
                });
                
                // Close panel when clicking outside
                document.addEventListener('click', function(e) {
                    if (!mapLayersPanel.contains(e.target) && e.target !== mapLayersToggle) {
                        mapLayersPanel.classList.add('hidden');
                    }
                });
            }
            
            // Layer checkboxes
            const layerPolygons = document.getElementById('layerPolygons');
            const layerCameras = document.getElementById('layerCameras');
            const layerWaze = document.getElementById('layerWaze');
            const layerWeather = document.getElementById('layerWeather');
            
            if (layerPolygons) {
                layerPolygons.addEventListener('change', function(e) {
                    Map.toggleLayer('polygons', e.target.checked);
                });
            }
            
            if (layerCameras) {
                layerCameras.addEventListener('change', function(e) {
                    Map.toggleLayer('cameras', e.target.checked);
                    self.updateLegend();
                });
            }
            
            if (layerWaze) {
                layerWaze.addEventListener('change', function(e) {
                    Map.toggleLayer('waze', e.target.checked);
                });
            }
            
            if (layerWeather) {
                layerWeather.addEventListener('change', function(e) {
                    Map.toggleLayer('weather', e.target.checked);
                });
            }
            
            // Mobile menu
            const mobileMenuButton = document.getElementById('mobileMenuButton');
            const mobileMenu = document.getElementById('mobileMenu');
            if (mobileMenuButton && mobileMenu) {
                mobileMenuButton.addEventListener('click', function() {
                    mobileMenu.classList.toggle('hidden');
                });
            }
            
            // Notification panel
            const alertsButton = document.getElementById('alertsButton');
            const notificationPanel = document.getElementById('notificationPanel');
            if (alertsButton && notificationPanel) {
                alertsButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    notificationPanel.classList.toggle('hidden');
                    
                    // Render notifications when opening
                    if (!notificationPanel.classList.contains('hidden')) {
                        UI.renderNotifications(self.state.polygons, 'notificationList');
                        self.setupNotificationHandlers();
                    }
                });
                
                // Close panel when clicking outside
                document.addEventListener('click', function(e) {
                    if (!notificationPanel.contains(e.target) && e.target !== alertsButton) {
                        notificationPanel.classList.add('hidden');
                    }
                });
            }
            
            // Mark all as read button
            const markAllReadBtn = document.getElementById('markAllReadBtn');
            if (markAllReadBtn) {
                markAllReadBtn.addEventListener('click', function() {
                    Notifications.markAllAsRead(self.state.polygons);
                    UI.renderNotifications(self.state.polygons, 'notificationList');
                    self.updateNotificationBadge();
                    UI.showToast('Todas as notificações marcadas como lidas', 'success');
                });
            }
            
            // Modal
            Modal.init();
            
            console.log('✅ UI initialized');
        },
        
        loadData: async function() {
            try {
                this.state.polygons = await API.getPolygons();
                
                this.state.polygons.sort(function(a, b) {
                    if (b.status_code !== a.status_code) {
                        return b.status_code - a.status_code;
                    }
                    return (b.label_count || 0) - (a.label_count || 0);
                });
                
                this.state.filteredPolygons = [...this.state.polygons];
                
                const stats = await API.getStatistics();
                UI.updateStatistics(stats);
                
                const self = this;
                UI.renderRegionCards(this.state.filteredPolygons, 'regionsGrid', function(p) { self.handleRegionClick(p); });
                await UI.renderCriticalAlerts('criticalAlerts', function(p) { self.handleRegionClick(p); });
                
                this.updateLastUpdateTime();
                this.updateLegend();
                
                console.log('✅ Loaded ' + this.state.polygons.length + ' regions');
                
            } catch (error) {
                console.error('❌ Load data error:', error);
                UI.showToast('Erro ao carregar dados', 'error');
            }
        },
        
        initializeMap: async function() {
            try {
                const mapContainer = document.getElementById('mapContainer');
                const mapLoading = document.getElementById('mapLoading');
                
                // Only initialize map if container exists
                if (!mapContainer) {
                    console.warn('Map container not found, skipping map initialization');
                    return;
                }
                
                await Map.initMap('mapContainer');
                if (mapLoading) mapLoading.remove();
                
                const self = this;
                Map.addPolygonMarkers(this.state.polygons, function(polygonId) {
                    const polygon = self.state.polygons.find(function(p) {
                        return p.cluster_id === polygonId;
                    });
                    if (polygon) self.handleRegionClick(polygon);
                });
                
                // Load camera data
                await Map.loadCameras();
                
                console.log('✅ Map initialized successfully');
            } catch (error) {
                console.error('❌ Map initialization error:', error.message);
                const mapLoading = document.getElementById('mapLoading');
                if (mapLoading) {
                    mapLoading.innerHTML = '<div class="text-center"><p class="text-sm text-slate-600 dark:text-slate-400">Erro ao carregar mapa</p></div>';
                }
            }
        },
        
        handleRegionClick: function(polygon) {
            this.state.selectedPolygon = polygon;
            Modal.open(polygon);
            if (polygon.lng_centroid && polygon.lat_centroid) {
                Map.centerMap(polygon.lng_centroid, polygon.lat_centroid, 15, 1500);
            }
            
            // Mark notification as read when region is clicked
            if (polygon.status_code > 0) {
                Notifications.markAsRead(polygon);
                this.updateNotificationBadge();
            }
        },
        
        setupNotificationHandlers: function() {
            const self = this;
            const notificationList = document.getElementById('notificationList');
            if (!notificationList) return;
            
            // Handle clicking on notification items
            notificationList.querySelectorAll('[data-cluster-id]').forEach(function(notifEl) {
                notifEl.addEventListener('click', function() {
                    const clusterId = notifEl.dataset.clusterId;
                    const polygon = self.state.polygons.find(function(p) {
                        return p.cluster_id === clusterId;
                    });
                    
                    if (polygon) {
                        // Mark as read
                        Notifications.markAsRead(polygon);
                        
                        // Close notification panel
                        const notificationPanel = document.getElementById('notificationPanel');
                        if (notificationPanel) {
                            notificationPanel.classList.add('hidden');
                        }
                        
                        // Open region modal
                        self.handleRegionClick(polygon);
                        
                        // Update badge
                        self.updateNotificationBadge();
                    }
                });
            });
            
            // Handle individual "mark as read" buttons
            notificationList.querySelectorAll('.mark-read-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const clusterId = btn.dataset.clusterId;
                    const polygon = self.state.polygons.find(function(p) {
                        return p.cluster_id === clusterId;
                    });
                    
                    if (polygon) {
                        Notifications.markAsRead(polygon);
                        UI.renderNotifications(self.state.polygons, 'notificationList');
                        self.setupNotificationHandlers();
                        self.updateNotificationBadge();
                    }
                });
            });
        },
        
        updateNotificationBadge: function() {
            const unreadCount = Notifications.getUnreadCount(this.state.polygons);
            const badge = document.getElementById('alertBadge');
            if (badge) {
                if (unreadCount > 0) {
                    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
        },
        
        applyPreferences: function() {
            if (!this.state.preferences) return;
            if (this.state.preferences.theme === 'dark') {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        },
        
        applyFilters: function() {
            const statusFilter = document.getElementById('statusFilter');
            const sortBy = document.getElementById('sortBy');
            
            let filtered = [...this.state.polygons];
            
            if (statusFilter && statusFilter.value !== 'all') {
                const statusCode = parseInt(statusFilter.value);
                filtered = filtered.filter(function(p) { return p.status_code === statusCode; });
            }
            
            if (sortBy) {
                switch (sortBy.value) {
                    case 'status':
                        filtered.sort(function(a, b) { return b.status_code - a.status_code; });
                        break;
                    case 'name':
                        filtered.sort(function(a, b) { return (a.main_route || '').localeCompare(b.main_route || ''); });
                        break;
                    case 'alerts':
                        filtered.sort(function(a, b) {
                            const aAlerts = (a.camera_flood_count || 0) + (a.waze_flood_count || 0);
                            const bAlerts = (b.camera_flood_count || 0) + (b.waze_flood_count || 0);
                            return bAlerts - aAlerts;
                        });
                        break;
                    case 'updated':
                        filtered.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
                        break;
                }
            }
            
            this.state.filteredPolygons = filtered;
            const self = this;
            UI.renderRegionCards(this.state.filteredPolygons, 'regionsGrid', function(p) { self.handleRegionClick(p); });
        },
        
        toggleMapFullscreen: function() {
            const mapContainer = document.getElementById('mapContainer');
            const mapSection = mapContainer ? mapContainer.closest('.bg-white') : null;
            const mapFullscreenBtn = document.getElementById('mapFullscreenBtn');
            
            if (!mapContainer || !mapSection) return;
            
            // Check if currently in fullscreen
            const isFullscreen = mapSection.classList.contains('map-fullscreen');
            
            if (isFullscreen) {
                // Exit fullscreen
                mapSection.classList.remove('map-fullscreen');
                mapContainer.style.height = '';
                
                // Update button icon to expand
                if (mapFullscreenBtn) {
                    mapFullscreenBtn.innerHTML = '<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>';
                    mapFullscreenBtn.title = 'Tela cheia';
                }
            } else {
                // Enter fullscreen
                mapSection.classList.add('map-fullscreen');
                mapContainer.style.height = 'calc(100vh - 120px)';
                
                // Update button icon to compress
                if (mapFullscreenBtn) {
                    mapFullscreenBtn.innerHTML = '<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25"></path></svg>';
                    mapFullscreenBtn.title = 'Sair da tela cheia';
                }
            }
            
            // Resize map to fit new container
            if (Map.map) {
                setTimeout(function() {
                    Map.map.resize();
                }, 100);
            }
        },
        
        setupAutoRefresh: function() {
            if (!this.state.preferences.autoRefresh) return;
            const interval = (this.state.preferences.refreshInterval || 60) * 1000;
            const self = this;
            this.state.autoRefreshInterval = setInterval(async function() {
                console.log('🔄 Auto-refreshing...');
                await self.loadData();
            }, interval);
            console.log('✅ Auto-refresh enabled (' + this.state.preferences.refreshInterval + 's)');
        },
        
        updateLastUpdateTime: function() {
            const lastUpdateEl = document.getElementById('lastUpdate');
            if (lastUpdateEl) {
                const now = new Date();
                lastUpdateEl.textContent = now.toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        },
        
        updateLegend: function() {
            if (!this.state.polygons) return;
            
            // Count polygons by status
            const counts = {
                critical: 0,
                alert: 0,
                attention: 0,
                normal: 0
            };
            
            this.state.polygons.forEach(function(polygon) {
                const status = polygon.status_code || 0;
                if (status >= 3) counts.critical++;
                else if (status === 2) counts.alert++;
                else if (status === 1) counts.attention++;
                else counts.normal++;
            });
            
            // Update legend counts
            const legendCritical = document.getElementById('legendCritical');
            const legendAlert = document.getElementById('legendAlert');
            const legendAttention = document.getElementById('legendAttention');
            const legendNormal = document.getElementById('legendNormal');
            
            if (legendCritical) legendCritical.textContent = '(' + counts.critical + ')';
            if (legendAlert) legendAlert.textContent = '(' + counts.alert + ')';
            if (legendAttention) legendAttention.textContent = '(' + counts.attention + ')';
            if (legendNormal) legendNormal.textContent = '(' + counts.normal + ')';
            
            // Update camera legend if cameras layer is visible
            const legendCameras = document.getElementById('legendCameras');
            const legendCameraDetecting = document.getElementById('legendCameraDetecting');
            
            if (Map.layerVisibility.cameras && Map.cameras.length > 0) {
                const detectingCount = Map.cameras.filter(function(cam) {
                    return cam.label === 1;
                }).length;
                
                if (legendCameras) legendCameras.classList.remove('hidden');
                if (legendCameraDetecting) legendCameraDetecting.textContent = '(' + detectingCount + ')';
            } else {
                if (legendCameras) legendCameras.classList.add('hidden');
            }
        },
        
        showLoadingOverlay: function(show) {
            const overlay = document.getElementById('loadingOverlay');
            if (overlay) {
                if (show) {
                    overlay.classList.remove('hidden');
                } else {
                    overlay.classList.add('hidden');
                }
            }
        }
    };
    
    // ===========================================
    // START APPLICATION
    // ===========================================
    
    // Detect which page we're on and initialize accordingly
    function detectAndInitialize() {
        const path = window.location.pathname;
        const isProfilePage = path.includes('profile.html');
        const isSettingsPage = path.includes('settings.html');
        const isLoginPage = path.includes('login.html');
        const isSignupPage = path.includes('signup.html');
        
        // Only initialize main App on index.html (dashboard)
        // Don't initialize on login, signup, profile, or settings pages
        if (!isProfilePage && !isSettingsPage && !isLoginPage && !isSignupPage) {
            App.init();
        }
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', detectAndInitialize);
    } else {
        detectAndInitialize();
    }
    
    // Export for debugging
    window.floodMonitor = {
        state: App.state,
        loadData: function() { return App.loadData(); },
        handleRegionClick: function(p) { return App.handleRegionClick(p); }
    };
    
    // ===========================================
    // PROFILE PAGE
    // ===========================================
    
    window.ProfilePage = {
        user: null,
        
        init: async function() {
            console.log('🚀 Initializing Profile Page...');
            
            try {
                // Check authentication
                if (!Auth.isAuthenticated()) {
                    console.log('❌ User not authenticated, redirecting to login...');
                    window.location.href = 'login.html';
                    return;
                }
                
                // Apply theme preferences
                const preferences = Storage.getPreferences();
                if (preferences.theme === 'dark') {
                    document.documentElement.classList.add('dark');
                }
                
                // Initialize UI handlers
                this.initializeUI();
                
                // Load user data
                await this.loadUserData();
                
                console.log('✅ Profile Page initialized');
            } catch (error) {
                console.error('❌ Profile init error:', error);
                UI.showToast('Erro ao carregar perfil', 'error');
            }
        },
        
        initializeUI: function() {
            const self = this;
            
            // Theme toggle
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', function() {
                    const html = document.documentElement;
                    const isDark = html.classList.contains('dark');
                    if (isDark) {
                        html.classList.remove('dark');
                        const prefs = Storage.getPreferences();
                        prefs.theme = 'light';
                        Storage.setPreferences(prefs);
                    } else {
                        html.classList.add('dark');
                        const prefs = Storage.getPreferences();
                        prefs.theme = 'dark';
                        Storage.setPreferences(prefs);
                    }
                });
            }
            
            // User menu
            const userMenuButton = document.getElementById('userMenuButton');
            const userMenuDropdown = document.getElementById('userMenuDropdown');
            if (userMenuButton && userMenuDropdown) {
                userMenuButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    userMenuDropdown.classList.toggle('hidden');
                });
                document.addEventListener('click', function() {
                    userMenuDropdown.classList.add('hidden');
                });
            }
            
            // Mobile menu
            const mobileMenuButton = document.getElementById('mobileMenuButton');
            const mobileMenu = document.getElementById('mobileMenu');
            if (mobileMenuButton && mobileMenu) {
                mobileMenuButton.addEventListener('click', function() {
                    mobileMenu.classList.toggle('hidden');
                });
            }
            
            // Logout buttons
            const logoutButton = document.getElementById('logoutButton');
            const logoutButtonMobile = document.getElementById('logoutButtonMobile');
            if (logoutButton) logoutButton.addEventListener('click', function() { Auth.logout(); });
            if (logoutButtonMobile) logoutButtonMobile.addEventListener('click', function() { Auth.logout(); });
            
            // Profile form
            const profileForm = document.getElementById('profileForm');
            if (profileForm) {
                profileForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    self.saveProfile();
                });
            }
            
            // Password form
            const passwordForm = document.getElementById('passwordForm');
            if (passwordForm) {
                passwordForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    self.changePassword();
                });
            }
            
            // Change avatar button
            const changeAvatarBtn = document.getElementById('changeAvatarBtn');
            if (changeAvatarBtn) {
                changeAvatarBtn.addEventListener('click', function() {
                    UI.showToast('Funcionalidade de upload de avatar em desenvolvimento', 'info');
                });
            }
        },
        
        loadUserData: async function() {
            try {
                // Get user from Auth
                this.user = await Auth.getCurrentUser();
                
                // Update UI with user data
                const userInitials = Auth.getUserInitials(this.user);
                
                // Update all initials displays
                const initialsElements = document.querySelectorAll('#userInitials, #userAvatarInitials');
                initialsElements.forEach(function(el) {
                    el.textContent = userInitials;
                });
                
                // Update profile information
                const userName = document.getElementById('userName');
                const userEmail = document.getElementById('userEmail');
                const userId = document.getElementById('userId');
                const accountCreated = document.getElementById('accountCreated');
                const lastLogin = document.getElementById('lastLogin');
                
                if (userName) userName.textContent = this.user.name || '--';
                if (userEmail) userEmail.textContent = this.user.email || '--';
                if (userId) userId.textContent = this.user._id || '--';
                
                if (accountCreated) {
                    accountCreated.textContent = this.user.createdAt 
                        ? DateTime.formatDate(this.user.createdAt) 
                        : '--';
                }
                
                if (lastLogin) {
                    lastLogin.textContent = DateTime.formatDate(new Date().toISOString());
                }
                
                // Update form inputs
                const inputName = document.getElementById('inputName');
                const inputEmail = document.getElementById('inputEmail');
                
                if (inputName) inputName.value = this.user.name || '';
                if (inputEmail) inputEmail.value = this.user.email || '';
                
            } catch (error) {
                console.error('Error loading user data:', error);
                UI.showToast('Erro ao carregar dados do usuário', 'error');
            }
        },
        
        saveProfile: async function() {
            try {
                const inputName = document.getElementById('inputName');
                const newName = inputName ? inputName.value.trim() : '';
                
                if (!newName) {
                    UI.showToast('Nome não pode estar vazio', 'warning');
                    return;
                }
                
                // In a real implementation, this would make an API call
                // For now, just update locally
                this.user.name = newName;
                
                // Update display
                const userName = document.getElementById('userName');
                if (userName) userName.textContent = newName;
                
                // Update initials
                const userInitials = Auth.getUserInitials(this.user);
                const initialsElements = document.querySelectorAll('#userInitials, #userAvatarInitials');
                initialsElements.forEach(function(el) {
                    el.textContent = userInitials;
                });
                
                UI.showToast('Perfil atualizado com sucesso!', 'success');
                
            } catch (error) {
                console.error('Error saving profile:', error);
                UI.showToast('Erro ao salvar perfil', 'error');
            }
        },
        
        changePassword: async function() {
            try {
                const currentPassword = document.getElementById('currentPassword');
                const newPassword = document.getElementById('newPassword');
                const confirmPassword = document.getElementById('confirmPassword');
                
                const current = currentPassword ? currentPassword.value : '';
                const newPass = newPassword ? newPassword.value : '';
                const confirm = confirmPassword ? confirmPassword.value : '';
                
                if (!current || !newPass || !confirm) {
                    UI.showToast('Preencha todos os campos', 'warning');
                    return;
                }
                
                if (newPass !== confirm) {
                    UI.showToast('As senhas não coincidem', 'warning');
                    return;
                }
                
                if (newPass.length < 8) {
                    UI.showToast('A senha deve ter no mínimo 8 caracteres', 'warning');
                    return;
                }
                
                // In a real implementation, this would make an API call
                UI.showToast('Senha alterada com sucesso!', 'success');
                
                // Clear form
                if (currentPassword) currentPassword.value = '';
                if (newPassword) newPassword.value = '';
                if (confirmPassword) confirmPassword.value = '';
                
            } catch (error) {
                console.error('Error changing password:', error);
                UI.showToast('Erro ao alterar senha', 'error');
            }
        }
    };
    
    // ===========================================
    // SETTINGS PAGE
    // ===========================================
    
    window.SettingsPage = {
        preferences: null,
        
        init: async function() {
            console.log('🚀 Initializing Settings Page...');
            
            try {
                // Check authentication
                if (!Auth.isAuthenticated()) {
                    console.log('❌ User not authenticated, redirecting to login...');
                    window.location.href = 'login.html';
                    return;
                }
                
                // Load preferences
                this.preferences = Storage.getPreferences();
                
                // Apply theme
                if (this.preferences.theme === 'dark') {
                    document.documentElement.classList.add('dark');
                }
                
                // Initialize UI
                this.initializeUI();
                
                // Load settings into UI
                this.loadSettings();
                
                console.log('✅ Settings Page initialized');
            } catch (error) {
                console.error('❌ Settings init error:', error);
                UI.showToast('Erro ao carregar configurações', 'error');
            }
        },
        
        initializeUI: function() {
            const self = this;
            
            // Theme toggle
            const themeToggle = document.getElementById('themeToggle');
            if (themeToggle) {
                themeToggle.addEventListener('click', function() {
                    const html = document.documentElement;
                    const isDark = html.classList.contains('dark');
                    if (isDark) {
                        html.classList.remove('dark');
                        self.preferences.theme = 'light';
                        const themeSelect = document.getElementById('themeSelect');
                        if (themeSelect) themeSelect.value = 'light';
                    } else {
                        html.classList.add('dark');
                        self.preferences.theme = 'dark';
                        const themeSelect = document.getElementById('themeSelect');
                        if (themeSelect) themeSelect.value = 'dark';
                    }
                });
            }
            
            // User menu
            const userMenuButton = document.getElementById('userMenuButton');
            const userMenuDropdown = document.getElementById('userMenuDropdown');
            if (userMenuButton && userMenuDropdown) {
                userMenuButton.addEventListener('click', function(e) {
                    e.stopPropagation();
                    userMenuDropdown.classList.toggle('hidden');
                });
                document.addEventListener('click', function() {
                    userMenuDropdown.classList.add('hidden');
                });
            }
            
            // Mobile menu
            const mobileMenuButton = document.getElementById('mobileMenuButton');
            const mobileMenu = document.getElementById('mobileMenu');
            if (mobileMenuButton && mobileMenu) {
                mobileMenuButton.addEventListener('click', function() {
                    mobileMenu.classList.toggle('hidden');
                });
            }
            
            // Logout buttons
            const logoutButton = document.getElementById('logoutButton');
            const logoutButtonMobile = document.getElementById('logoutButtonMobile');
            if (logoutButton) logoutButton.addEventListener('click', function() { Auth.logout(); });
            if (logoutButtonMobile) logoutButtonMobile.addEventListener('click', function() { Auth.logout(); });
            
            // Load user initials
            Auth.getCurrentUser().then(function(user) {
                if (user) {
                    const userInitials = Auth.getUserInitials(user);
                    const initialsElements = document.querySelectorAll('#userInitials');
                    initialsElements.forEach(function(el) {
                        el.textContent = userInitials;
                    });
                }
            });
            
            // Theme select
            const themeSelect = document.getElementById('themeSelect');
            if (themeSelect) {
                themeSelect.addEventListener('change', function(e) {
                    const theme = e.target.value;
                    self.preferences.theme = theme;
                    
                    if (theme === 'dark') {
                        document.documentElement.classList.add('dark');
                    } else if (theme === 'light') {
                        document.documentElement.classList.remove('dark');
                    } else {
                        // Auto mode - check system preference
                        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                            document.documentElement.classList.add('dark');
                        } else {
                            document.documentElement.classList.remove('dark');
                        }
                    }
                });
            }
            
            // Auto refresh toggle
            const autoRefreshToggle = document.getElementById('autoRefreshToggle');
            if (autoRefreshToggle) {
                autoRefreshToggle.addEventListener('change', function(e) {
                    self.preferences.autoRefresh = e.target.checked;
                });
            }
            
            // Refresh interval slider
            const refreshIntervalSlider = document.getElementById('refreshIntervalSlider');
            const refreshIntervalValue = document.getElementById('refreshIntervalValue');
            if (refreshIntervalSlider && refreshIntervalValue) {
                refreshIntervalSlider.addEventListener('input', function(e) {
                    const value = parseInt(e.target.value);
                    self.preferences.refreshInterval = value;
                    refreshIntervalValue.textContent = value + 's';
                });
            }
            
            // Zoom slider
            const zoomSlider = document.getElementById('zoomSlider');
            const zoomValue = document.getElementById('zoomValue');
            if (zoomSlider && zoomValue) {
                zoomSlider.addEventListener('input', function(e) {
                    const value = parseInt(e.target.value);
                    if (!self.preferences.map) self.preferences.map = {};
                    self.preferences.map.defaultZoom = value;
                    zoomValue.textContent = value;
                });
            }
            
            // Clear cache button
            const clearCacheBtn = document.getElementById('clearCacheBtn');
            if (clearCacheBtn) {
                clearCacheBtn.addEventListener('click', function() {
                    if (confirm('Tem certeza que deseja limpar o cache?')) {
                        // Clear specific cache items but keep auth and preferences
                        const keysToRemove = [];
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (key && key.startsWith(CONFIG.storagePrefix) && 
                                !key.includes('preferences') && 
                                !key.includes('authToken')) {
                                keysToRemove.push(key);
                            }
                        }
                        keysToRemove.forEach(function(key) {
                            localStorage.removeItem(key);
                        });
                        UI.showToast('Cache limpo com sucesso!', 'success');
                    }
                });
            }
            
            // Reset settings button
            const resetSettingsBtn = document.getElementById('resetSettingsBtn');
            if (resetSettingsBtn) {
                resetSettingsBtn.addEventListener('click', function() {
                    if (confirm('Tem certeza que deseja redefinir todas as configurações? Esta ação não pode ser desfeita.')) {
                        // Reset to defaults
                        self.preferences = {
                            theme: 'light',
                            autoRefresh: true,
                            refreshInterval: 60,
                            map: {
                                defaultZoom: 10
                            }
                        };
                        Storage.setPreferences(self.preferences);
                        self.loadSettings();
                        document.documentElement.classList.remove('dark');
                        UI.showToast('Configurações redefinidas!', 'success');
                    }
                });
            }
            
            // Save settings button
            const saveSettingsBtn = document.getElementById('saveSettingsBtn');
            if (saveSettingsBtn) {
                saveSettingsBtn.addEventListener('click', function() {
                    self.saveSettings();
                });
            }
        },
        
        loadSettings: function() {
            // Theme
            const themeSelect = document.getElementById('themeSelect');
            if (themeSelect) {
                themeSelect.value = this.preferences.theme || 'light';
            }
            
            // Auto refresh
            const autoRefreshToggle = document.getElementById('autoRefreshToggle');
            if (autoRefreshToggle) {
                autoRefreshToggle.checked = this.preferences.autoRefresh !== false;
            }
            
            // Refresh interval
            const refreshIntervalSlider = document.getElementById('refreshIntervalSlider');
            const refreshIntervalValue = document.getElementById('refreshIntervalValue');
            if (refreshIntervalSlider && refreshIntervalValue) {
                const interval = this.preferences.refreshInterval || 60;
                refreshIntervalSlider.value = interval;
                refreshIntervalValue.textContent = interval + 's';
            }
            
            // Zoom
            const zoomSlider = document.getElementById('zoomSlider');
            const zoomValue = document.getElementById('zoomValue');
            if (zoomSlider && zoomValue) {
                const zoom = (this.preferences.map && this.preferences.map.defaultZoom) || 10;
                zoomSlider.value = zoom;
                zoomValue.textContent = zoom;
            }
            
            // Notifications toggle
            const notificationsToggle = document.getElementById('notificationsToggle');
            if (notificationsToggle) {
                notificationsToggle.checked = this.preferences.notifications !== false;
            }
            
            // Critical only toggle
            const criticalOnlyToggle = document.getElementById('criticalOnlyToggle');
            if (criticalOnlyToggle) {
                criticalOnlyToggle.checked = this.preferences.criticalOnly === true;
            }
            
            // Sound toggle
            const soundToggle = document.getElementById('soundToggle');
            if (soundToggle) {
                soundToggle.checked = this.preferences.sound === true;
            }
            
            // Traffic toggle
            const trafficToggle = document.getElementById('trafficToggle');
            if (trafficToggle) {
                trafficToggle.checked = this.preferences.showTraffic === true;
            }
        },
        
        saveSettings: function() {
            try {
                // Gather all settings from UI
                const notificationsToggle = document.getElementById('notificationsToggle');
                const criticalOnlyToggle = document.getElementById('criticalOnlyToggle');
                const soundToggle = document.getElementById('soundToggle');
                const trafficToggle = document.getElementById('trafficToggle');
                
                if (notificationsToggle) {
                    this.preferences.notifications = notificationsToggle.checked;
                }
                if (criticalOnlyToggle) {
                    this.preferences.criticalOnly = criticalOnlyToggle.checked;
                }
                if (soundToggle) {
                    this.preferences.sound = soundToggle.checked;
                }
                if (trafficToggle) {
                    this.preferences.showTraffic = trafficToggle.checked;
                }
                
                // Save to storage
                Storage.setPreferences(this.preferences);
                
                UI.showToast('Configurações salvas com sucesso!', 'success');
                
                // Redirect back to dashboard after a short delay
                setTimeout(function() {
                    window.location.href = 'index.html';
                }, 1500);
                
            } catch (error) {
                console.error('Error saving settings:', error);
                UI.showToast('Erro ao salvar configurações', 'error');
            }
        }
    };
    
})();

