# Pilot Guide

In the real world, aerodrome controllers use stopbars as a bar of illuminated lights preventing aircraft from entering active runways. Within Microsoft Flight Simulator, this can be emulated using the BARS client. Stopbar state is shared between pilots and controllers participating in the plugin.

<br>

> [!WARNING]  
> Due to simulator limitations in MSFS 2020, the stopbar lights may not render until closer to the holding point. However, this does not affect the stopbar's functionality and will operate as intended. Additionally, **it is recommended** to enable the bloom setting, as without it, the visual effects of the stopbars will not be accurate.

## Setup

### Installation  
The BARS Client can be installed through the [BARS Website](https://stopbars.com). If the client is installed correctly, you should be able to search for "BARS Client" in windows, once opened the client will be minimized into the desktop taskbar tray.

<br>

<figure>
    <img src="../Assets/BARS_client_install.png" width="450">
    <figcaption></figcaption>
</figure>

<br>

### Connection
Upon launching your preferred simulator, the BARS client will have automatically opened. Users are required to obtain a token through the [BARS](https://stopbars.com) website. Sign up for an account first, then inside the "Account Settings" page, click "Show Token" to obtain your token. Paste this token into the API Token field, **do not share this token with anyone**.

Once spawned at a [compatible airport](#compatible-airports--scenery), **locate the BARS Client icon in the desktop taskbar tray, right-click, and select "Show."*** The client will display important information, including the current status, the closest airport, and the number of stopbars spawned. Note: if a controller connects to the network, it will take a maximum of 2 minutes for the stopbars to load within your simulator. 

<br>

<figure>
    <img src="../Assets/BARS_client_connection.png" width="350">
    <figcaption></figcaption>
</figure>

<br>

### Stopbar Behaviour
In the real world, stopbars are either red or unilluminated. Within the BARS Client, a dropdown under "Stopbar Behaviour" allows users to select their preferred stopbar behaviour. When the realistic option is selected, stopbars will transition from red to unilluminated, while the unrealistic option will cause stopbars to change from red to green.

<br>

<figure>
    <img src="../Assets/BARS_stopbar_behaviour.png" width="350">
    <figcaption></figcaption>
</figure>

<br>

### Third Party Scenery
To configure BARS for third-party scenery, reopen the BARS Client from the desktop taskbar tray after the initial installation. Navigate to scenery section, find or search for the compatible airport, and click the dropdown menu. Select your payware scenery and click the "Restart to Apply Changes" button at the bottom. This will restart the BARS client, and once completed, stopbars will be configured for your selected favorite payware airports.

<br>

<figure>
    <img src="../Assets/BARS_client_scenery.png" width="350">
    <figcaption></figcaption>
</figure>

<br>

### Reporting BARS Issues

> [!TIP]  
>  If you encounter any issues with BARS, you can report them via the GitHub repository's "Issues" tab or by creating a user report through the BARS Discord Server. When submitting an issue, it’s essential to include as much detail as possible to help with troubleshooting. If required, you may need to provide the log file generated by BARS. These logs can be found in your `%localappdata%/BARS` directory. Save a copy of this file ASAP, as after every launch logs are deleted.