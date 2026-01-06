// Leaflet Terminator v0.1.0 - https://github.com/joergdietrich/Leaflet.Terminator
(function (factory, window) {
    if (typeof define === 'function' && define.amd) {
        define(['leaflet'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('leaflet'));
    }
    if (typeof window !== 'undefined' && window.L) {
        window.L.terminator = factory(window.L);
    }
}
(function (L) {
    var Terminator = L.Polygon.extend({
        options: {
            color: '#00',
            opacity: 0.5,
            fillColor: '#00',
            fillOpacity: 0.5,
            resolution: 2
        },

        initialize: function (options) {
            this.version = '0.1.0';
            this._latLngs = [];
            L.Util.setOptions(this, options);
            L.Polygon.prototype.initialize.call(this, this._latLngs, this.options);
        },

        onAdd: function (map) {
            this._map = map;
            this._update();
            L.Polygon.prototype.onAdd.call(this, map);
        },

        _update: function () {
            this.setLatLngs(this._compute(this._time()));
        },

        _time: function() {
            return new Date();
        },

        _compute: function(time) {
            var today = new Date(time);
            var julianDay = this._julian(today);
            var gst = this._gmst(today);
            var latLngs = [];
            var sunEclPos = this._sunEclipticPosition(julianDay);
            var eclObliq = this._eclipticObliquity(julianDay);
            var sunEqPos = this._sunEquatorialPosition(sunEclPos.lambda, eclObliq);

            for (var i = 0; i <= 360 * this.options.resolution; i++) {
                var lng = -180 + i / this.options.resolution;
                var ha = this._hourAngle(lng, sunEqPos, gst);
                latLngs[i+1] = [this._latitude(ha, sunEqPos), lng];
            }
            if (sunEqPos.delta < 0) {
                latLngs[0] = [90, -180];
                latLngs[latLngs.length] = [90, 180];
            } else {
                latLngs[0] = [-90, -180];
                latLngs[latLngs.length] = [-90, 180];
            }
            return latLngs;
        },

        _julian: function(date) {
            return (date.valueOf() / 86400000) - (date.getTimezoneOffset() / 1440) + 2440587.5;
        },

        _gmst: function(date) {
            var julianDay = this._julian(date);
            var d = julianDay - 2451545.0;
            return (18.697374558 + 24.06570982441908 * d) % 24;
        },

        _sunEclipticPosition: function(julianDay) {
            var n = julianDay - 2451545.0;
            var L = (280.460 + 0.9856474 * n) % 360;
            var g = (357.528 + 0.9856003 * n) % 360;
            if (L < 0) L += 360;
            if (g < 0) g += 360;
            var lambda = L + 1.915 * Math.sin(g * Math.PI / 180) +
                0.020 * Math.sin(2 * g * Math.PI / 180);
            return { lambda: lambda, R: 1.00014 - 0.01671 * Math.cos(g * Math.PI / 180) - 0.00014 * Math.cos(2 * g * Math.PI / 180) };
        },

        _eclipticObliquity: function(julianDay) {
            var n = julianDay - 2451545.0;
            var T = n / 36525;
            var epsilon = 23.43929111 -
                46.8150 / 3600 * T -
                0.00059 / 3600 * T * T +
                0.001813 / 3600 * T * T * T;
            return epsilon;
        },

        _sunEquatorialPosition: function(lambda, epsilon) {
            var alpha = Math.atan2(Math.cos(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180), Math.cos(lambda * Math.PI / 180));
            var delta = Math.asin(Math.sin(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180));
            return { alpha: alpha, delta: delta };
        },

        _hourAngle: function(lng, sunPos, gst) {
            var lst = gst + lng / 15;
            return lst * 15 * Math.PI / 180 - sunPos.alpha;
        },

        _latitude: function(ha, sunPos) {
            var lat = Math.atan(-Math.cos(ha) / Math.tan(sunPos.delta));
            return lat * 180 / Math.PI;
        }
    });

    return function(options) {
        return new Terminator(options);
    };
}, window));
