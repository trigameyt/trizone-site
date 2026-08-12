package fr.trizone.weblink;

import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.lang.reflect.Method;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

public final class TrizoneWebLink extends JavaPlugin {
    private HttpClient httpClient;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(getConfig().getInt("timeout-seconds", 8)))
                .build();
        getLogger().info("TrizoneWebLink v1.1.0 actif. /link <code> et /link sync");
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Cette commande doit être utilisée en jeu.");
            return true;
        }

        if (args.length == 1 && args[0].equalsIgnoreCase("sync")) {
            syncProfile(player);
            return true;
        }

        if (args.length != 1 || !args[0].matches("\\d{6}")) {
            player.sendMessage(color("&8[&5Trizone&8] &7Utilise &f/link <code à 6 chiffres> &7ou &f/link sync&7."));
            return true;
        }

        linkAccount(player, args[0]);
        return true;
    }

    private void linkAccount(Player player, String code) {
        String apiUrl = getConfig().getString("api-url", "");
        String secret = getConfig().getString("secret", "");
        if (!isConfigured(apiUrl, secret, player)) return;

        String rank = getPrimaryGroup(player);
        String json = "{" +
                "\"code\":\"" + escapeJson(code) + "\"," +
                "\"uuid\":\"" + player.getUniqueId() + "\"," +
                "\"username\":\"" + escapeJson(player.getName()) + "\"," +
                "\"rank\":\"" + escapeJson(rank) + "\"" +
                "}";

        send(player, apiUrl, secret, json,
                "&7Vérification du code...",
                "&aCompte lié avec succès ! &7Grade synchronisé : &f" + rank,
                "Code invalide ou expiré.");
    }

    private void syncProfile(Player player) {
        String apiUrl = getConfig().getString("sync-url", "https://trizone.club/api/minecraft/profile-sync");
        String secret = getConfig().getString("secret", "");
        if (!isConfigured(apiUrl, secret, player)) return;

        String rank = getPrimaryGroup(player);
        String json = "{" +
                "\"uuid\":\"" + player.getUniqueId() + "\"," +
                "\"username\":\"" + escapeJson(player.getName()) + "\"," +
                "\"rank\":\"" + escapeJson(rank) + "\"" +
                "}";

        send(player, apiUrl, secret, json,
                "&7Synchronisation du profil...",
                "&aProfil synchronisé. &7Grade : &f" + rank,
                "Ton compte Minecraft n'est pas encore lié au site.");
    }

    private boolean isConfigured(String apiUrl, String secret, Player player) {
        if (apiUrl == null || apiUrl.isBlank() || secret == null || secret.isBlank() || "CHANGE_ME".equals(secret)) {
            player.sendMessage(color("&8[&5Trizone&8] &cLa liaison web n'est pas encore configurée."));
            getLogger().warning("Configure api-url/sync-url et secret dans plugins/TrizoneWebLink/config.yml");
            return false;
        }
        return true;
    }

    private void send(Player player, String apiUrl, String secret, String json, String waiting, String success, String fallbackError) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .timeout(Duration.ofSeconds(getConfig().getInt("timeout-seconds", 8)))
                .header("Content-Type", "application/json")
                .header("X-Trizone-Secret", secret)
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        player.sendMessage(color("&8[&5Trizone&8] " + waiting));
        CompletableFuture<HttpResponse<String>> future = httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString());
        future.whenComplete((response, throwable) -> getServer().getScheduler().runTask(this, () -> {
            if (!player.isOnline()) return;
            if (throwable != null) {
                player.sendMessage(color("&8[&5Trizone&8] &cImpossible de contacter le site. Réessaie dans quelques secondes."));
                getLogger().warning("Erreur API liaison: " + throwable.getMessage());
                return;
            }
            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                player.sendMessage(color("&8[&5Trizone&8] " + success));
                return;
            }
            String message = extractJsonMessage(response.body());
            player.sendMessage(color("&8[&5Trizone&8] &c" + (message == null ? fallbackError : message)));
        }));
    }

    private String getPrimaryGroup(Player player) {
        try {
            Class<?> providerClass = Class.forName("net.luckperms.api.LuckPermsProvider");
            Object luckPerms = providerClass.getMethod("get").invoke(null);
            Class<?> luckPermsApi = Class.forName("net.luckperms.api.LuckPerms");
            Class<?> userManagerApi = Class.forName("net.luckperms.api.model.user.UserManager");
            Class<?> userApi = Class.forName("net.luckperms.api.model.user.User");
            Object userManager = luckPermsApi.getMethod("getUserManager").invoke(luckPerms);
            Method getUser = userManagerApi.getMethod("getUser", UUID.class);
            Object user = getUser.invoke(userManager, player.getUniqueId());
            if (user != null) {
                Object group = userApi.getMethod("getPrimaryGroup").invoke(user);
                if (group != null && !String.valueOf(group).isBlank()) return String.valueOf(group);
            }
        } catch (ClassNotFoundException ignored) {
            // LuckPerms n'est pas présent : le site affichera default.
        } catch (Throwable error) {
            getLogger().warning("Impossible de lire le grade LuckPerms: " + error.getMessage());
        }
        return "default";
    }

    private String escapeJson(String input) {
        return input.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String extractJsonMessage(String body) {
        if (body == null) return null;
        String marker = "\"error\":\"";
        int start = body.indexOf(marker);
        if (start < 0) return null;
        start += marker.length();
        int end = body.indexOf('"', start);
        if (end < 0) return null;
        return body.substring(start, end).replace("\\\"", "\"");
    }

    private String color(String text) {
        return ChatColor.translateAlternateColorCodes('&', text);
    }
}
