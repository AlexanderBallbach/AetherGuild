// Based on the excellent work by https://github.com/joergdietrich/Leaflet.Terminator

function calculateTerminator(date) {
    const JD = getJulianDate(date);
    const T = (JD - 2451545.0) / 36525;
    const L = (280.460 + 36000.770 * T) % 360;
    const G = (357.528 + 35999.050 * T) % 360;
    const ec = 23.4393 - 0.0130 * T;
    const lambda = L + 1.915 * Math.sin(G * Math.PI / 180) + 0.020 * Math.sin(2 * G * Math.PI / 180);

    const sunEclPos = sunEclipticPosition(lambda);
    const sunEqPos = sunEquatorialPosition(sunEclPos.lambda, ec);
    
    let gst = (100.46 + 36000.77 * T + 15 * (date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600)) % 360;
    if (gst < 0) gst += 360;
    
    const points = [];
    for (let i = 0; i <= 360; i++) {
        const lng = -180 + i;
        const ha = hourAngle(lng, sunEqPos, gst);
        const lat = latitude(ha, sunEqPos);
        points.push([lng, lat]);
    }

    // Connect the ends to form a polygon
    points.push([-180, points[points.length-1][1]]);
    points.push([-180, -90]);
    points.push([180, -90]);
    points.push([180, points[0][1]]);
    points.push([points[0][0], points[0][1]]);
    
    // Check if the north or south pole is in shadow
    const northInSun = latitude(hourAngle(0, sunEqPos, gst), sunEqPos) > 0;
    if (northInSun) {
         points.push([-180, 90]);
         points.push([180, 90]);
    } else {
         points.push([-180, -90]);
         points.push([180, -90]);
    }


    return {
        type: "Feature",
        properties: {},
        geometry: {
            type: "Polygon",
            coordinates: [points]
        }
    };
}

function getJulianDate(date) {
    return (date.getTime() / 86400000) + 2440587.5;
}

function sunEclipticPosition(lambda) {
    const G = (357.528 + 35999.050 * ((getJulianDate(new Date()) - 2451545.0) / 36525)) % 360;
    const R = 1.00014 - 0.01671 * Math.cos(G * Math.PI / 180) - 0.00014 * Math.cos(2 * G * Math.PI / 180);
    return { lambda: lambda, R: R };
}

function sunEquatorialPosition(lambda, epsilon) {
    let alpha = Math.atan2(Math.cos(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180), Math.cos(lambda * Math.PI / 180));
    let delta = Math.asin(Math.sin(epsilon * Math.PI / 180) * Math.sin(lambda * Math.PI / 180));
    return { alpha: alpha, delta: delta };
}

function hourAngle(lng, sunPos, gst) {
    const lst = gst + lng;
    return lst * Math.PI / 180 - sunPos.alpha;
}

function latitude(ha, sunPos) {
    const lat = Math.atan(-Math.cos(ha) / Math.tan(sunPos.delta));
    return lat * 180 / Math.PI;
}
