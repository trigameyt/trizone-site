package fr.trizone.weblink;

import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandSender;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.CompletableFuture;

public final class TrizoneWebLink extends JavaPlugin {
    private HttpClient httpClient;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(getConfig().getInt("timeout-seconds", 8)))
                .build();
        getLogger().info("TrizoneWebLink active. Commande: /link <code>");
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (!(sender instanceof Player player)) {
            sender.sendMessage("Cette commande doit être utilisée en jeu.");
            return true;
        }

        if (args.length != 1 || !args[0].matches("\\d{6}")) {
            player.sendMessage(color("&8[&5Trizone&8] &7Utilise &f/link <code à 6 chiffres>&7."));
            return true;
        }

        String apiUrl = getConfig().getString("api-url", "");
        String secret = getConfig().getString("secret", "");
        if (apiUrl.isBlank() || secret.isBlank() || "CHANGE_ME".equals(secret)) {
            player.sendMessage(color("&8[&5Trizone&8] &cLa liaison web n'est pas encore configurée."));
            getLogger().warning("Configure api-url et secret dans plugins/TrizoneWebLink/config.yml");
            return true;
        }

        String json = "{" +
                "\"code\":\"" + escapeJson(args[0]) + "\"," +
                "\"uuid\":\"" + player.getUniqueId() + "\"," +
                "\"username\":\"" + escapeJson(player.getName()) + "\"" +
                "}";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .timeout(Duration.ofSeconds(getConfig().getInt("timeout-seconds", 8)))
                .header("Content-Type", "application/json")
                .header("X-Trizone-Secret", secret)
                .POST(HttpRequest.BodyPublishers.ofString(json))
                .build();

        player.sendMessage(color("&8[&5Trizone&8] &7Vérification du code..."));

        CompletableFuture<HttpResponse<String>> future = httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString());
        future.whenComplete((response, throwable) -> getServer().getScheduler().runTask(this, () -> {
            if (!player.isOnline()) return;

            if (throwable != null) {
                player.sendMessage(color("&8[&5Trizone&8] &cImpossible de contacter le site. Réessaie dans quelques secondes."));
                getLogger().warning("Erreur API liaison: " + throwable.getMessage());
                return;
            }

            if (response.statusCode() >= 200 && response.statusCode() < 300) {
                player.sendMessage(color("&8[&5Trizone&8] &aCompte lié avec succès !"));
                return;
            }

            String message = extractJsonMessage(response.body());
            player.sendMessage(color("&8[&5Trizone&8] &c" + (message == null ? "Code invalide ou expiré." : message)));
        }));

        return true;
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
