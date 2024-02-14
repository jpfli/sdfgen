document.addEventListener('DOMContentLoaded', () => {
    const file_input = document.getElementById('file-input');
    const generate_button = document.getElementById('generate-button');
    const copy_button = document.getElementById("copy-button");
    const radios = document.getElementsByName('formatting');

    const expectedWidth = 688;
    const expectedHeight = 688;

    let range = 0;
    let image_sdf = [];
    let final_sdf = [];
    let textarea_formatting = "decimal";

    file_input.addEventListener('change', (event) => {
        const file = event.target.files[0];
        const reader = new FileReader();

        reader.onload = function() {
            const img = new Image();
            img.onload = function() {
                let input_canvas = document.getElementById('input-canvas');

                if(img.width % 16 != 0 || ((img.width / 16) & 1) == 0 || img.height % 16 != 0 || ((img.height / 16) & 1) == 0) {
                    //input_canvas.hidden = true;
                    //document.getElementById('generate-button').hidden = true;
                    //document.getElementById('load-button').textContent = "Choose...";

                    alert("Error: Image dimensions must be 16 multiplied by odd numbers. For example 688px (43x16). Please adjust and try again.");
                    return;
                }

                image_sdf = [];
                final_sdf = [];

                generate_button.disabled = false;
                document.getElementById('sdf-canvas').hidden = true;
                document.getElementById('result-canvas').hidden = true;
                document.getElementById('textarea-div').textContent = "";

                input_canvas.width = img.width;
                input_canvas.height = img.height;
                const ctx = input_canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                input_canvas.hidden = false;

                document.getElementById('load-button').textContent = file.name;
            }
            img.src = reader.result;
        }
        reader.readAsDataURL(file);
    });

    generate_button.addEventListener('click', () => {
        const input_canvas = document.getElementById('input-canvas');
        let ctx = input_canvas.getContext('2d');

        let binary_img = convert_to_binary(ctx.getImageData(0, 0, input_canvas.width, input_canvas.height));

        const dist_positive = edt(binary_img);
        const dist_negative = edt(binary_img.map(row => row.map(p => 1 - p)));
        const sdf = dist_positive.map((pos_row, idx) => pos_row.map((pos, idx2) => Math.max(0.5, pos) - Math.max(0.5, dist_negative[idx][idx2])));

        range = parseInt(document.getElementById('range').value);
        if(range <= 0) range = Math.max(...sdf.map(row => Math.max(...row.map(p => Math.abs(p)))));

        // Convert SDF values to unsigned 8 bit
        image_sdf = sdf.map(sub => sub.map(item => Math.max(0, Math.min(255, Math.round(128 + item * 127 / range)))));

        let image = array_to_image(image_sdf);

        let sdf_canvas = document.getElementById('sdf-canvas');
        sdf_canvas.hidden = false;

        draw_image(image, sdf_canvas);

        image = scale_image(image, 1.0 / 16);
        final_sdf = image_to_array(image);

        // Convert values from unsigned to signed
        final_sdf = final_sdf.map(sub => sub.map(item => Math.max(-127, Math.min(127, Math.round(item - 128)))));

        document.getElementById('copy-button').hidden = false;
        let result_canvas = document.getElementById('result-canvas');
        result_canvas.hidden = false;

        draw_image(image, result_canvas);

        let formatting = 0;
        // Loop through the radio buttons
        for(let i = 0; i < radios.length; ++i) {
            if (radios[i].checked) {
                formatting = i;
                break; // Exit the loop once the selected radio is found
            }
        }

        copy_sdf_to_textarea();
    });

    // Event listener for copy to clipboard button
    copy_button.addEventListener("click", function() {
        if(final_sdf.length == 0) {
            alert("You must first generate the SDF");
            return;
        }

        let textarea_div = document.getElementById('textarea-div');

        // Copy textarea content to clipboard
        navigator.clipboard.writeText(textarea_div.textContent)
            .then(() => {
                // Temporarily change the button text to "Copied"
                copy_button.textContent = 'Copied';
            })
            .catch(err => {
                console.error('Failed to copy: ', err);
            });

        // Revert the button text back after  3 seconds
        setTimeout(function() {
          copy_button.textContent = 'Copy';
        },  3000);
    });

    radios.forEach(function(radio) { radio.addEventListener("change", (event) => {
            textarea_formatting = event.target.value;

            copy_sdf_to_textarea();
        });
    });

    function copy_sdf_to_textarea() {
        if(final_sdf.length == 0) {
            return;
        }

        let textarea_div = document.getElementById('textarea-div');
        textarea_div.textContent = "// width: " + final_sdf[0].length + "; height: " + final_sdf.length + "; range: " + range + ";\n";
        if(textarea_formatting == "decimal") {
            textarea_div.textContent += final_sdf.map(row => row.join(',')).join(',\n');
        }
        else if(textarea_formatting == "int8") {
            textarea_div.textContent += final_sdf.map(row => row.map(v => (v < 0 ? "-0x" : " 0x") + Math.abs(((v + 128) & 0xff) - 128).toString(16).padStart(2, '0')).join(',')).join(',\n');
        }
        else if(textarea_formatting == "uint8") {
            textarea_div.textContent += final_sdf.map(row => row.map(v => "0x" + (v & 0xff).toString(16).padStart(2, '0')).join(',')).join(',\n');
        }
    }

    function draw_image(image_data, canvas) {
        canvas.width = image_data.width;
        canvas.height = image_data.height;
        ctx = canvas.getContext('2d');

        ctx.putImageData(image_data, 0, 0);
    }

    function scale_image(image_data, scale) {
        // Create a temporary canvas
        const canvas = document.createElement('canvas');
        canvas.width = image_data.width;
        canvas.height = image_data.height;
        const ctx = canvas.getContext('2d');
        ctx.putImageData(image_data, 0, 0);

        const width = scale * image_data.width;
        const height = scale * image_data.height;

        ctx.drawImage(canvas, 0, 0, width, height);
        const scaled_image = ctx.getImageData(0, 0, width, height);

        // Remove the temporary canvases
        canvas.remove();

        return scaled_image;
    }

    // Takes a 2D array of grayscale values and converts it to ImageData
    function array_to_image(arr) {
        const width = arr[0].length;
        const height = arr.length;
        
        const image_data = new ImageData(width, height);
        const data = image_data.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const value = arr[y][x];
                const index = (y * width + x) * 4;
                data[index] = value;     // Red channel
                data[index + 1] = value; // Green channel
                data[index + 2] = value; // Blue channel
                data[index + 3] = 255;   // Alpha channel
            }
        }

        return image_data;
    }

    // Takes ImageData and converts it to a 2D array of grayscale values
    function image_to_array(image_data) {
        const arr = [];

        const data = image_data.data;

        for (let y = 0; y < image_data.height; y++) {
            const row = [];
            for (let x = 0; x < image_data.width; x++) {
                const index = (y * image_data.width + x) * 4;
                row.push(Math.round((data[index] + data[index + 1] + data[index + 2]) / 3.0));
            }
            arr.push(row);
        }
        return arr;
    }

    function convert_to_binary(image_data) {
        const binary_img = [];

        const width = image_data.width;
        const height = image_data.height;
        const data = image_data.data;

        for (let y = 0; y < height; y++) {
            binary_img[y] = [];
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                // Calculate brightness using the formula: (r+g+b)/3
                const brightness = (r + g + b) / 3;
                // If brightness is less than 128, set the pixel to 1 (white), otherwise set it to 0 (black)
                binary_img[y][x] = brightness < 128 ? 0 : 1;
            }
        }

        return binary_img;
    }

    function edt(binary_img) {
        const width = binary_img[0].length;
        const height = binary_img.length;

        const INF = parseInt(1e9);
        let dist_row = Array.from(binary_img, row => Array.from(row, p => p < 1 ? INF : 0));

        // First Phase - Iterate over all rows
        for(let i = 0; i < height; ++i) {
            // Forward pass
            for(let j = 1; j < width; ++j) {
                dist_row[i][j] = Math.min(dist_row[i][j], dist_row[i][j - 1] + 1);
            }

            // Backward pass
            for(let j = width - 2; j >= 0; --j) {
                dist_row[i][j] = Math.min(dist_row[i][j], dist_row[i][j + 1] + 1);
            }
        }

        // Lower envelope indices
        let s = Array(height).fill(0);
        // same least minimizers
        let t = Array(height).fill(0);
        // final distance field squared
        let dist_sq = Array(height).fill().map(() => Array(width).fill(0));

        // Second Phase - Compute Distance transform
        for (let j = 0; j < width; j++) {
            let q = 0;
            s[0] = 0;
            t[0] = 0;

            for (let u = 1; u < height; u++) {
                while (q >= 0 && edt_f(t[q], s[q], dist_row[s[q]][j]) > edt_f(t[q], u, dist_row[u][j])) {
                    q -= 1;
                }
                if (q < 0) {
                    q = 0;
                    s[0] = u;
                } else {
                    let w = 1 + edt_sep(s[q], u, dist_row[s[q]][j], dist_row[u][j]);
                    if (w < height) {
                        q += 1;
                        s[q] = u;
                        t[q] = w;
                    }
                }
            }

            for (let u = height - 1; u >= 0; u--) {
                dist_sq[u][j] = edt_f(u, s[q], dist_row[s[q]][j]);
                if (u === t[q]) {
                    q -= 1;
                }
            }
        }

        return dist_sq.map(row => row.map(p => Math.sqrt(p)));
    }

    // Euclidean Distance Transform F function
    function edt_f(x, i, g_i) {
        return (x - i) * (x - i) + (g_i * g_i);
    }

    // Euclidean Distance Transform SEP function
    function edt_sep(i, u, g_i, g_u) {
        return Math.floor((u * u - i * i + g_u * g_u - g_i * g_i) / (2 * (u - i)));
    }
});

