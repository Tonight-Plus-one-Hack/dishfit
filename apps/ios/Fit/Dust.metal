#include <metal_stdlib>
#include <SwiftUI/SwiftUI_Metal.h>
using namespace metal;

constant float kCell = 1.75;
constant float2 kDrift[] = {
    float2(-0.86, -0.36), float2(-0.63,  0.20), float2(-0.48, -0.67),
    float2(-0.04,  0.43), float2( 0.28, -0.48), float2( 0.40,  0.38),
    float2( 0.76, -0.74), float2( 1.00,  0.23), float2( 0.85, -0.18)
};
constant int kDriftCount = sizeof(kDrift) / sizeof(kDrift[0]);

static float3 cellNoise(float2 cell) {
    float3 p = fract(cell.xyx * float3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yzz) * p.zyx);
}

static half4 ink(half4 sample, bool photo, bool dark) {
    if (sample.a <= 0.001h) { return half4(0.0); }
    float3 rgb = float3(sample.rgb) / max(float(sample.a), 0.001);
    float luminance = dot(rgb, float3(0.21, 0.72, 0.07));
    float chroma = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
    float strength = photo ? 1.0 - smoothstep(0.44, 0.69, luminance)
        : (dark ? smoothstep(0.15, 0.52, luminance) : 1.0 - smoothstep(0.50, 0.76, luminance));
    if (!photo) { strength = max(strength, smoothstep(0.16, 0.34, chroma)); }
    return sample * half(strength);
}

[[ stitchable ]] half4 scanDust(float2 position, SwiftUI::Layer layer, float4 bounds,
                                float elapsed, float margin, float frontStart, float frontDuration,
                                float lifetime, float direction, float dark) {
    bool photo = direction > 0.0;
    float2 origin = bounds.xy + margin;
    float2 local = position - origin;
    float width = max(bounds.z - 2.0 * margin, 1.0);
    float frontSlope = frontDuration / width;
    float ageHere = direction * (elapsed - frontStart - local.x * frontSlope);
    float reach = min(width * 0.116, 44.0);
    if (ageHere <= -0.068) {
        half4 solid = layer.sample(position);
        return photo ? ink(solid, true, false) : solid;
    }
    if (ageHere >= lifetime + reach * frontSlope) { return half4(0.0); }

    float jitter = (cellNoise(floor(local / kCell)).z - 0.5) * 0.085;
    float intact = 1.0 - smoothstep(-0.025, 0.043, ageHere + jitter);
    half4 solid = intact > 0.0 ? layer.sample(position) * half(intact) : half4(0.0);
    if (photo) { solid = ink(solid, true, false); }
    if (intact >= 1.0 || ageHere <= 0.0) { return solid; }

    half4 dust = half4(0.0);
    for (int i = 0; i < kDriftCount; i++) {
        float2 velocity = reach / lifetime * kDrift[i];
        // Invert destination = source + velocity * age for a front whose age varies with x.
        float age = ageHere / (1.0 - direction * velocity.x * frontSlope);
        if (age <= 0.0 || age >= lifetime) { continue; }

        float2 source = local - velocity * age;
        float2 cell = floor(source / kCell);
        float3 noise = cellNoise(cell);
        if (noise.y < 0.19) { continue; }
        // Nearby source cells often travel together. A second assignment loosens the
        // edges of each cluster so the streaks can separate as they move.
        float cluster = cellNoise(floor((cell * kCell + (noise.xy - 0.5) * 2.0) / 8.0)).z;
        float trajectory = noise.x < 0.25 ? noise.z : cluster;
        if (int(trajectory * float(kDriftCount)) != i) { continue; }

        float fraction = age / lifetime;
        float end = mix(photo ? 0.65 : 0.83, 1.0, noise.x);
        float fade = 1.0 - smoothstep(end - 0.20, end, fraction);
        if (fade <= 0.0) { continue; }

        float2 center = (cell + 0.5 + (noise.xy - 0.5) * 0.32) * kCell;
        float radius = mix(0.51, 0.98, noise.x);
        float shape = 1.0 - smoothstep(radius - 0.12, radius + 0.14,
                                      length((source - center) * float2(0.85, 1.07)));
        if (shape <= 0.0) { continue; }

        half4 grain = ink(layer.sample(origin + center), photo, dark > 0.5) * half(shape * fade);
        dust = grain + dust * (1.0h - grain.a);
    }
    return solid + dust * (1.0h - solid.a);
}
