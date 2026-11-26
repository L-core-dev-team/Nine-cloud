"""九霄天文（候选扩展，非 Canon）：太阳与月亮的低精度位置。

时间口径：九霄标准时以天衍城子午线为准（候选）。地方视太阳时 = 标准时 + 经度差/15°。
序章兼容基线：芦花渡 纬度 30°N、在标准子午线以东 15°，秋分前后（赤纬≈0），
于是 日出≈05:00、正午≈11:00、日落≈17:00，与规则的卯初开局、酉初入暮一致。
"""
import math

OBLIQUITY = math.radians(23.44)

def solar_declination(day_of_year):
    # 低精度：以春分为 day 80 的正弦近似（误差 < 1°），足够驱动光照
    return OBLIQUITY * math.sin(2 * math.pi * (day_of_year - 80) / 365.2422)

def sun_alt_az(standard_minutes, day_of_year, lat_deg, lon_east_of_ref_deg):
    lat = math.radians(lat_deg)
    dec = solar_declination(day_of_year)
    local_solar_hours = standard_minutes / 60.0 + lon_east_of_ref_deg / 15.0
    H = math.radians((local_solar_hours - 12.0) * 15.0)
    sin_alt = math.sin(lat) * math.sin(dec) + math.cos(lat) * math.cos(dec) * math.cos(H)
    alt = math.asin(max(-1, min(1, sin_alt)))
    az = math.atan2(-math.sin(H), math.tan(dec) * math.cos(lat) - math.sin(lat) * math.cos(H))
    return alt, (az + 2 * math.pi) % (2 * math.pi)   # azimuth from north, clockwise

SYNODIC = 29.530588

def moon_phase_angle(days_since_new):
    """0 = 朔, pi = 望"""
    return 2 * math.pi * ((days_since_new % SYNODIC) / SYNODIC)

def moon_alt_az(standard_minutes, day_of_year, lat_deg, lon_deg, days_since_new):
    # 粗略：月亮相对太阳每天东移约 12.19°，赤纬近似取太阳赤纬随相位旋转（误差数度，作画面用）
    elong = moon_phase_angle(days_since_new)
    lat = math.radians(lat_deg)
    dec = solar_declination(day_of_year + elong / (2 * math.pi) * 365.2422 / 12.37 * 12.37 / 1)  # 近似
    dec = OBLIQUITY * math.sin(2 * math.pi * (day_of_year - 80) / 365.2422 + elong)
    local_solar_hours = standard_minutes / 60.0 + lon_deg / 15.0
    H = math.radians((local_solar_hours - 12.0) * 15.0) - elong
    sin_alt = math.sin(lat) * math.sin(dec) + math.cos(lat) * math.cos(dec) * math.cos(H)
    alt = math.asin(max(-1, min(1, sin_alt)))
    az = math.atan2(-math.sin(H), math.tan(dec) * math.cos(lat) - math.sin(lat) * math.cos(H))
    return alt, (az + 2 * math.pi) % (2 * math.pi)

if __name__ == '__main__':
    for m in (300, 330, 660, 1020, 1035):
        a, z = sun_alt_az(m, 266, 30, 15)
        print(m, round(math.degrees(a), 2), round(math.degrees(z), 1))
